---
title: "Bash 3.2 + set -u: Which Empty Array Expansions Crash?"
description: "Script fine on Linux, dead on macOS with unbound variable? Six tested combos on bash 3.2 vs 5.x, plus the two guards: ${arr[@]+…} and set +u."
date: 2026-11-22
tags: [bash, macOS]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why does bash report 'unbound variable' for an empty array?"
    a: "Under set -u, bash 3.2 (the /bin/bash shipped with macOS) treats any expansion of an empty array — ${arr[@]} or \"${arr[@]}\" — as referencing an unset variable. Bash 4.4 and newer allow it. The ${#arr[@]} length form does not crash; an undefined name in arithmetic does, on every version."
  - q: "How do I protect a bash script against empty arrays under set -u?"
    a: "Two guards, one per crash site. For word expansions use ${arr[@]+\"${arr[@]}\"} — expand only when the array is defined. For arithmetic wrap the expression in $( set +u; echo $(( … )) ), which also covers the undefined-name crash that affects every bash version."
  - q: "Why does the same script behave differently on macOS and Linux?"
    a: "macOS ships /bin/bash 3.2.57 from 2007; Linux distributions ship 4.4+ (commonly 5.x). Bash 4.4 relaxed the empty-array behavior under set -u. Install bash 5.x via Homebrew to get Linux-identical behavior for local testing."
---

The same backup restore-drill script runs on schedule on the production server every day; run it under local regression testing and it dies on one arithmetic line with nothing but `unbound variable` — no status file, no log entry.

Ran into this while building [CCLee Server Sentinel](/docs/server-sentinel) — monitoring and alerting for Linux servers: performance, availability, security and backup. Alerts arrive as conclusions with next steps, and backups are proven restorable by monthly real-restore drills.

## TL;DR

Under `set -u`, bash 3.2 (macOS's `/bin/bash`) and bash 5.x disagree about which expansions of an **empty array** or an **undefined name** count as "unset" — and only one crash site spans every version. Tested live on bash 3.2.57 and 5.3.20, six combinations:

| Expression | bash 3.2 (macOS system) | bash 5.x (brew / modern Linux) |
|---|---|---|
| Empty-array word expansion `${arr[@]}` (quoted or not) | **crashes** with unbound | fine |
| Empty-array arithmetic `$(( ${#arr[@]} ))` | fine (yields 0) | fine |
| Undefined name in arithmetic `$(( ${#undef[@]} ))` | **crashes** | **crashes** |

Two guards, one per site: write word expansions as `${arr[@]+"${arr[@]}"}` (covers 3.2's empty-array crash), and wrap arithmetic in `$( set +u; echo $(( … )) )` (covers the everywhere-fatal undefined-name crash).

## Symptom: dead on the arithmetic line, no status file, no log

The script runs `set -u`, and its first real statement counts the drill targets:

```bash
# pre-fix shape (same structure as the crash site)
EXPECTED=$(( ${#DRILL_DUMPS[@]} + ${#TAR_FILES[@]} ))
```

`DRILL_DUMPS` / `TAR_FILES` come from a config renderer: a list section that exists renders an array assignment; one that doesn't, renders nothing. The conf used for local regression happened to miss a section, so one of the two variables never existed — the script exited right there with `unbound variable`. No drill status JSON, nothing in the log, and 22 regression assertions failing with zero output — which looks exactly like the script-under-test being broken.

The confusing part: the same script produced results on production TencentOS daily. "Fine in production, dead locally" — the difference was not the script but the local bash version.

## Root cause: bash 3.2 and 5.x distribute the crash sites differently

macOS ships `/bin/bash` frozen at 3.2.57 (the 2007 GPLv2 release), while Homebrew and modern Linux distributions carry 5.x. Under `set -u` (nounset), which expansions count as "unset" differs between generations. All of the following is live terminal output:

```console
$ /bin/bash --version | head -1
GNU bash, version 3.2.57(1)-release (arm64-apple-darwin26)

$ /bin/bash -uc 'arr=(); for x in ${arr[@]}; do echo $x; done'
bash: arr[@]: unbound variable

$ /bin/bash -uc 'arr=(); for x in "${arr[@]}"; do echo $x; done'    # quoted crashes too
bash: arr[@]: unbound variable

$ /bin/bash -uc 'arr=(); echo $(( ${#arr[@]} ))'                    # arithmetic length is fine
0

$ /bin/bash -uc 'echo $(( ${#undef[@]} ))'                          # undefined: arithmetic crashes
bash: undef: unbound variable

$ /opt/homebrew/bin/bash -uc 'arr=(); for x in ${arr[@]}; do echo $x; done; echo done'
done                                                                # 5.3: empty-array expansion is fine

$ /opt/homebrew/bin/bash -uc 'echo $(( ${#undef[@]} ))'
bash: undef: unbound variable                                       # undefined: 5.3 crashes the same way
```

Note the second case: **quoting does not exempt it**. The common belief that `"${arr[@]}"` is the safe form does not hold on 3.2 under `set -u`. Meanwhile the empty-array arithmetic length never crashes on either generation; the only everywhere-fatal site is an **undefined name** in arithmetic (`bash: undef: unbound variable` — notice the error names `undef`, not `undef[@]`).

One wrong turn worth recording: the first suspect was the script's own logic, and changing it fixed nothing. The contrast with "works in production" is what redirected the investigation toward the version difference — the same variable reference is "unset" to 3.2 and "empty" to 5.x.

## The guards: one convention per crash site

**Word expansions** — `${arr[@]+"${arr[@]}"}` means "expand to the element list only if the array is defined; otherwise expand to nothing". This is the `+`-test form of parameter expansion: it tests before expanding, so 3.2 never reports unbound. Every array loop in the drill script uses this shape:

```bash
for pair in ${DRILL_DUMPS[@]+"${DRILL_DUMPS[@]}"}; do
```

**Arithmetic** — the `${#arr[@]}` length form cannot take the `+`-test, and the undefined-name crash affects every bash version, so wrap the expression in a subshell that locally drops `-u`:

```bash
EXPECTED=$( set +u; echo $(( ${#DRILL_DUMPS[@]} + ${#TAR_FILES[@]} )) )   # set +u：bash3.2 空数组保护
```

The `set +u` applies inside the subshell only — the rest of the script keeps strict mode. An undefined name becomes 0 in the arithmetic, which is the correct semantics for counting drill targets; if your expression must distinguish "undefined" from "zero", this guard does not apply and you need an explicit emptiness check.

The same "fine in the terminal, dead in a script" family has another member: [grep -P works in the terminal but dies in the script? zsh and bash don't share PATH](/blog/zsh-bash-script-grep-p-invalid-option) — different root cause (two PATHs for interactive vs. script shells), same symptom family.

<InfoBox variant="warning" title="Watch out">

- **Two stub-environment traps in the same family**: on macOS, `date` lives at `/bin/date` — `/usr/bin/date` does not exist, so tooling that hardcodes the latter fails to find the command.
- **`printf '%d'` silently emits 0 for an empty value**: tested on bash 3.2.57, `printf '%d\n' ""` prints `0` and exits 0 with **no error at all**. When asserting numeric fields like `last_ok_epoch` or `epoch`, a 0 may be an empty value swallowed by printf, not a real value — check the true source.
- When regression and production run different bash versions, "the test passed" is not "production behaves this way"; either apply both guards everywhere or align versions first with `bash --version`.

</InfoBox>

## FAQ

### Why does bash report 'unbound variable' for an empty array?

Under `set -u`, bash 3.2 (the `/bin/bash` shipped with macOS) treats any expansion of an empty array — `${arr[@]}` or `"${arr[@]}"` — as referencing an unset variable. Bash 4.4 and newer allow it. The `${#arr[@]}` length form does not crash; an undefined name in arithmetic does, on every version.

### How do I protect a bash script against empty arrays under set -u?

Two guards, one per crash site. For word expansions use `${arr[@]+"${arr[@]}"}` — expand only when the array is defined. For arithmetic wrap the expression in `$( set +u; echo $(( … )) )`, which also covers the undefined-name crash that affects every bash version.

### Why does the same script behave differently on macOS and Linux?

macOS ships `/bin/bash` 3.2.57 from 2007; Linux distributions ship 4.4+ (commonly 5.x). Bash 4.4 relaxed the empty-array behavior under `set -u`. Install bash 5.x via Homebrew to get Linux-identical behavior for local testing.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
