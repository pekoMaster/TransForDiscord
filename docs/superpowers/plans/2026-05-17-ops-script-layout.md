# Ops Script Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move root database operation scripts into `scripts/ops/` while preserving existing root commands.

**Architecture:** This is an adapter-first ops cleanup. Real implementations move to `scripts/ops/`; root `.bat` and `.sh` files become wrappers. Moved scripts must compute the project root explicitly before reading `.env`, `data/`, or scheduling root wrappers.

**Tech Stack:** Windows batch files, Bash scripts, PowerShell workflow, static validation only for server/DB-affecting scripts.

---

## Scope

Move these low-risk layout items:

- `db-pull.bat` -> `scripts/ops/db-pull.bat`
- `db-pull.sh` -> `scripts/ops/db-pull.sh`
- `db-push.sh` -> `scripts/ops/db-push.sh`
- `setup-schedule.bat` -> `scripts/ops/setup-schedule.bat`

Do not execute any script that can connect to SSH, copy databases, create scheduled tasks, or run `pm2`.

## Tasks

- [x] **Step 1: Baseline inventory**

Run:

```powershell
Get-ChildItem -Force -File db-pull.bat,db-pull.sh,db-push.sh,setup-schedule.bat
rg -n "db-pull|db-push|setup-schedule|scripts/ops|scripts\\ops" . -g "!node_modules/**" -g "!data/**"
```

- [x] **Step 2: Move implementations**

Run:

```powershell
New-Item -ItemType Directory -Force scripts\ops
git mv db-pull.bat scripts\ops\db-pull.bat
git mv db-pull.sh scripts\ops\db-pull.sh
git mv db-push.sh scripts\ops\db-push.sh
git mv setup-schedule.bat scripts\ops\setup-schedule.bat
```

- [x] **Step 3: Add root wrappers**

Root wrappers:

```bat
@echo off
set SCRIPT_DIR=%~dp0
call "%SCRIPT_DIR%scripts\ops\db-pull.bat" %*
```

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/ops/db-pull.sh" "$@"
```

- [x] **Step 4: Fix moved implementation root paths**

Moved `.sh` scripts must use:

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
```

Moved `.bat` scripts must use:

```bat
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set ROOT_DIR=%%~fI
```

- [x] **Step 5: Update docs**

Update:

- `doc/system/FILE_INDEX.md`
- `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] **Step 6: Static verification**

Run:

```powershell
bash -n scripts\ops\db-pull.sh
bash -n db-pull.sh
bash -n scripts\ops\db-push.sh
bash -n db-push.sh
rg -n "SCRIPT_DIR|ROOT_DIR|ENV_FILE|scripts/ops|scripts\\ops|db-pull|db-push|setup-schedule" db-pull.bat db-pull.sh db-push.sh setup-schedule.bat scripts\ops doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
git diff --check
```

- [x] **Step 7: Review and commit**

Confirm:

- Root commands still exist as wrappers.
- Moved scripts read project root `.env`, not `scripts/ops/.env`.
- `setup-schedule.bat` schedules the root `db-pull.bat` wrapper.
- No SSH/DB/schtasks command was executed during verification.
- `doc/SSH_FIX_LOG.md` remains untracked and untouched.
