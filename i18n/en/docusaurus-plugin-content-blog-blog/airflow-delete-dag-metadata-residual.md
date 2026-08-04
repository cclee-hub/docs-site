---
title: "Airflow DAG Still in the List After Deletion? Metadata Not Cleaned + Correct Order"
description: "After deleting a DAG's .py file, the dag_id still lingers in the Airflow UI and database; clearing metadata before deleting the file makes the rows come back. Root cause: dag-processor re-registers on scan, and reserialize doesn't purge orphan rows. Fix: delete file first, then SQL DELETE in foreign-key order, then verify with dags reserialize."
date: 2026-08-05
tags: [Airflow, DevOps, PostgreSQL, Bug Fix]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does a DAG still show in Airflow after deleting its .py file?"
    a: "Deleting the file doesn't clean the database. Rows in dag/serialized_dag/dag_code/dag_version remain, and the Web UI reads those tables. You must manually DELETE them in foreign-key order."
  - q: "How do I completely delete an Airflow DAG and all its metadata?"
    a: "Three steps: 1) delete the .py file so dag-processor stops registering it; 2) SQL DELETE in foreign-key order (dag_run→serialized_dag→dag_version→dag→orphan dag_code); 3) run airflow dags reserialize and confirm the dag row doesn't reappear."
  - q: "What's the correct order to clean Airflow DAG metadata, and why not clear metadata before deleting the file?"
    a: "Delete the file first, then clean metadata. If you reverse it, the .py file still exists, so dag-processor re-registers the cleared dag row on the next scan — the metadata 'comes back to life.'"
---

After deleting a DAG's `.py` file in Airflow to retire it, the `dag_id` still hangs around in the Web UI list and the database; even stranger — if you clear the metadata first and delete the file second, the just-cleared rows "come back to life."

Encountered this while building [AI Ops](/docs/ai-analytics) — an LLM-powered analytics pipeline where retiring an old report DAG required cleaning its metadata too, otherwise the UI list and scheduled scans stayed polluted by residual rows.

## TL;DR

Airflow's dag-processor periodically scans the DAG folder and re-registers DAGs, and `airflow dags reserialize` doesn't purge "file-already-deleted" orphan rows — so just deleting the `.py` file won't make the `dag_id` vanish from the UI or DB. Conversely, clearing metadata before deleting the file lets the processor re-register the cleared rows on its next scan ("revival"). Correct order: **①delete the file first so the processor stops registering → ②SQL DELETE in foreign-key order → ③run `airflow dags reserialize` to verify**.

## Symptoms

Retiring the `shop_report_aggregation` DAG — after deleting its `.py` file:

```text
$ ls /opt/airflow/project/airflow_dags/shop_report_aggregation.py
ls: cannot access '.../shop_report_aggregation.py': No such file or directory

$ # but it's still in the database
$ docker exec cclhub-db psql -U airflow -d airflow -c \
    "SELECT dag_id, is_paused, is_active FROM dag WHERE dag_id='shop_report_aggregation';"
       dag_id            | is_paused | is_active
--------------------------+-----------+-----------
 shop_report_aggregation | f         | t          ← still there
```

It's not just the `dag` table — the matching rows in `serialized_dag`, `dag_code`, and `dag_version` are all still there, so the Web UI keeps showing this "deleted" DAG.

Worse is the reverse order — clear metadata first, delete file second:

```text
T0  DELETE FROM dag WHERE dag_id='shop_report_aggregation';   ← cleared
T1  (.py file not deleted yet)
T2  dag-processor scan fires; file exists, dag table has no row → re-registers
T3  SELECT ... FROM dag WHERE dag_id='shop_report_aggregation';   ← it's back (revival)
```

## Root Cause

Two mechanisms stack up:

**1. dag-processor scans and re-registers periodically.** Airflow's dag-processor (part of the Scheduler) scans `dags_folder` on `processor_poll_interval` (default ~5 min), parses each `.py` file, and upserts into the metadata tables (`dag`, `serialized_dag`, `dag_version`). **As long as the file exists, the next scan rewrites those rows.** That's the direct source of "revival" — you clear the row, the file is still there, and the processor re-registers it as a new DAG.

**2. `reserialize` ignores "file-gone" orphan rows.** `airflow dags reserialize` re-serializes **existing** DAG files and refreshes `serialized_dag`; it does not delete orphan `dag` rows whose files have vanished. And `airflow dags cleanup` only purges expired `dag_run` history by default — **it also leaves** the `dag` / `serialized_dag` / `dag_code` / `dag_version` metadata tables alone. So after you delete the file, the metadata rows become orphans nobody cleans.

```text
┌─ dag-processor ──────────────────────────────┐
│  scans dags_folder                            │
│  ├─ file present → upsert dag / serialized... │  ← source of revival
│  └─ file absent  → skip, no row deletion      │  ← orphan residue
└───────────────────────────────────────────────┘
```

Conclusion: to actually remove the metadata, you must give the processor **no file to register** (delete the file first), then manually clean the residual rows.

## Solution

### Step 1: Delete the file first

Make the `.py` file disappear from the DAG folder so dag-processor stops registering it.

```bash
# In production this is usually synced to the volume-mounted DAG folder
# /opt/airflow/project/airflow_dags/ via git pull
git pull   # removes shop_report_aggregation.py from the repo and the folder

# or delete directly (after confirming nothing depends on it)
rm /opt/airflow/project/airflow_dags/shop_report_aggregation.py
```

### Step 2: Clean metadata in foreign-key order

DELETE in foreign-key dependency order to avoid constraint violations. Deleting `dag_run` CASCADEs to `task_instance`:

```sql
BEGIN;

-- 1. run history (CASCADEs to task_instance)
DELETE FROM dag_run      WHERE dag_id = 'shop_report_aggregation';

-- 2. serialized DAG
DELETE FROM serialized_dag WHERE dag_id = 'shop_report_aggregation';

-- 3. version
DELETE FROM dag_version  WHERE dag_id = 'shop_report_aggregation';

-- 4. dag main table
DELETE FROM dag          WHERE dag_id = 'shop_report_aggregation';

-- 5. dag_code is keyed by source hash; multiple DAGs may share the same code;
--    only delete hashes no longer referenced by any serialized_dag
DELETE FROM dag_code
WHERE dag_hash NOT IN (SELECT dag_hash FROM serialized_dag);

COMMIT;
```

### Step 3: Verify

```bash
airflow dags reserialize

# confirm the dag row is not rebuilt
docker exec cclhub-db psql -U airflow -d airflow -c \
  "SELECT count(*) FROM dag WHERE dag_id='shop_report_aggregation';"
#  count
# -------
#      0   ✅
```

After `reserialize`, `dag` / `serialized_dag` / `dag_code` / `dag_version` are all 0 for that `dag_id`, and the next processor scan doesn't rebuild them — the cleanup is stable.

As a side note, on the same pipeline, [pandas NaN crashing XCom serialization](/blog/airflow-xcom-nan-not-json-compliant) is another pitfall worth bookmarking.

## Notes

<InfoBox variant="warning" title="Notes">

- **`dag_code` is shared by source hash**: multiple DAGs can reference the same source hash, so before deleting, always use the orphan check (`dag_hash NOT IN (SELECT dag_hash FROM serialized_dag)`) — never delete by `dag_id`, because this table has no `dag_id` column at all.
- **Don't expect `airflow dags cleanup` to clear metadata**: it only purges expired `dag_run` rows (controlled by `max_active_runs` / retention) and leaves `dag` / `serialized_dag` / `dag_code` / `dag_version` untouched. Cleaning metadata means hand-written SQL.
- **Waiting one scan cycle after deleting the file is safer**: in an extreme race, a processor scan could land in the window between your file deletion and your metadata cleanup. In practice the "delete file → clean metadata → reserialize to verify" order is enough; rerun reserialize once more if needed.
- **Check for downstream dependencies before retiring a DAG**: other DAGs may wait on it via `ExternalTaskSensor` or trigger it via `TriggerDagRunOperator`. grep for `dag_id` references first.

</InfoBox>

## FAQ

### Why does a DAG still show in Airflow after deleting its .py file?

Deleting the file doesn't clean the database. Rows in `dag` / `serialized_dag` / `dag_code` / `dag_version` still exist, and the Web UI reads those tables to render the list, so the deleted DAG keeps showing. Airflow has no built-in command to purge these orphan rows automatically; you must SQL DELETE them manually in foreign-key order.

### How do I completely delete an Airflow DAG and all its metadata?

Three steps: 1) delete the `.py` file so dag-processor stops registering it; 2) SQL DELETE in foreign-key order (`dag_run` → `serialized_dag` → `dag_version` → `dag` → orphan `dag_code`); 3) run `airflow dags reserialize`, then query the `dag` table to confirm the `dag_id` row count stays at 0 and isn't rebuilt.

### What's the correct order to clean Airflow DAG metadata, and why not clear metadata before deleting the file?

Delete the file first, then clean metadata. If you reverse it, the `.py` file still exists, so dag-processor re-registers the cleared `dag` row on its next scan — the metadata "comes back to life." Only by making the file vanish first (so the processor has nothing to register) and then cleaning the residual rows can you fully retire the DAG.

---

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
