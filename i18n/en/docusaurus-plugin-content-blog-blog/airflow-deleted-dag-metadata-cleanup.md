---
title: "Airflow DAG gone but metadata stays? Delete order matters"
description: "Airflow keeps deleted DAG metadata in dag and serialized_dag; cleaning tables before deleting the file resurrects it. Order: file, tables, reserialize."
date: 2026-09-28
tags: [Airflow, PostgreSQL, DevOps]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does a deleted DAG still show in the Airflow UI?"
    a: "Its metadata rows remain in dag, serialized_dag, dag_code and dag_version, and the UI renders from tables. reserialize only upserts files that exist — it never removes rows for vanished files, so the tables need a manual DELETE in foreign-key order."
  - q: "Why did the metadata I cleaned come back?"
    a: "The DAG file was still on disk when the tables were cleaned: dag-processor periodically scans the DAG directory and re-registers any file it finds. Delete the file first (git pull into the mounted directory), then clean tables, then reserialize to confirm."
  - q: "What is the right order to fully remove an Airflow DAG?"
    a: "1) delete the .py file and sync the DAG directory; 2) DELETE in foreign-key order: dag_run (cascades task_instance) → serialized_dag → dag_code → dag_version → dag; 3) run airflow dags reserialize and confirm the dag table stays clean."
---

The .py file is gone from the codebase and deployed — yet the DAG still sits in Airflow's list. You clean the metadata tables by hand, and minutes later the rows are back.

Encountered this while building [AI Ops](/docs/ai-analytics) — LLM-powered analytics that surfaces market trends, user behavior, and sales data for precise operational strategy. Retiring old analysis types in the DAG pipeline left zombie entries piling up in the list page.

## Symptom: the file is gone, the metadata refuses to leave

Two symptoms, depending on the order you did things:

- **File deleted first, tables checked after**: rows for the dag_id remain in `dag`, `serialized_dag`, `dag_code` and `dag_version`, and the UI list still shows the DAG;
- **Tables cleaned first, file deleted after**: stranger still — freshly DELETEd rows reappear within minutes. The DAG "resurrects".

If you searched for "Airflow delete DAG still shows in UI" or "dag metadata comes back", same story.

## Root cause: dag-processor registers whatever it finds; reserialize never cleans

The resurrection is designed behavior, not a haunting:

- **dag-processor periodically scans the DAG directory**. As long as the .py file exists, the scan parses it and re-registers metadata rows — which is exactly why cleaning tables before deleting the file resurrects the DAG: at clean time the file was still there, and the next scan rebuilt everything.
- **`airflow dags reserialize` only registers upward**. It serializes "files currently in the directory" into the tables, but **never removes rows whose files have disappeared** — run reserialize after deleting a file and the leftovers don't budge.

So the order of "delete file" vs "clean metadata" is inherently one-directional: while the file exists, cleaning is futile; once it's gone, one clean is final.

## The fix: delete file → clean tables in FK order → reserialize to verify

Three steps, order not negotiable:

1. **Delete the .py file first**. In production the DAG directory is a volume mount — sync via git pull on the host rather than deleting inside the container:

```bash
ssh <host> "cd /root/workspace/ai_dag && git pull"
# the DAG directory (mounted as /opt/airflow/dags) no longer has the .py
```

2. **Clean the metadata in foreign-key order** (`task_instance` goes with `dag_run` via cascade):

```sql
DELETE FROM dag_run        WHERE dag_id = 'old_dag';      -- cascades task_instance
DELETE FROM serialized_dag WHERE dag_id = 'old_dag';
DELETE FROM dag_code       WHERE dag_id = 'old_dag';
DELETE FROM dag_version    WHERE dag_id = 'old_dag';
DELETE FROM dag            WHERE dag_id = 'old_dag';
```

3. **Run reserialize as the verification**: after `airflow dags reserialize`, query the `dag` table — if the dag_id doesn't reappear, the cleanup is final.

The whole thing takes under a minute; with the file gone from the directory, dag-processor's scans have nothing to re-register.

## Boundary cases

- **Make sure no scheduler/processor is mid-parse of that DAG** before cleaning — avoid racing the registrar; off-peak windows keep it simple.
- **If run history matters as evidence**, export it with SELECT first — run history is the only record of "what actually happened"; once deleted it's gone.
- **Same dag_id moving directories/platform folders** follows the same logic: make the old file disappear from the directory first, then do the metadata surgery.
- **Metadata schemas differ across Airflow versions** (`dag_code`/`dag_version` are relatively recent) — `\d` your own tables and foreign keys before running DELETEs; don't copy table names blind.

<InfoBox variant="warning" title="Watch out">

- **The order is an iron rule**: cleaning tables before deleting the file = guaranteed resurrection. Put "delete the file" at step one and everything after is downhill.
- **Direct SQL against a production metadata database is high-risk**: WHERE must pin the exact dag_id — check affected row counts inside a transaction before committing.
- **The UI's "delete" button (newer versions) goes through an API path** with different behavior from manual table cleaning; this flow targets scenarios needing precise control of what gets removed.

</InfoBox>

## FAQ

### Why does a deleted DAG still show in the Airflow UI?

Its metadata rows remain in `dag`, `serialized_dag`, `dag_code` and `dag_version`, and the UI renders from tables. reserialize only upserts files that exist — it never removes rows for vanished files, so the tables need a manual DELETE in foreign-key order.

### Why did the metadata I cleaned come back?

The DAG file was still on disk when the tables were cleaned: dag-processor periodically scans the DAG directory and re-registers any file it finds. Delete the file first (git pull into the mounted directory), then clean tables, then reserialize to confirm.

### What is the right order to fully remove an Airflow DAG?

1) delete the .py file and sync the DAG directory; 2) DELETE in foreign-key order: dag_run (cascades task_instance) → serialized_dag → dag_code → dag_version → dag; 3) run `airflow dags reserialize` and confirm the dag table stays clean.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
