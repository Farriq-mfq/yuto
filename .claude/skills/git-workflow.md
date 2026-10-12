---
name: git-workflow
description: Git conventions for Yuto. Use when starting a task, branching, committing, preparing a merge, or undoing a mistake.
---

# Git workflow (Yuto)

## Start

1. `git status` must be clean. If not, commit or stash first.
2. Branch from the main branch: `git switch -c feat/<short-name>`.
   Prefixes: `feat/`, `fix/`, `test/`, `docs/`, `chore/`, `refactor/`.
3. One branch = one task from `docs/IMPLEMENTATION_PLAN.md`.

## Work loop

- Small commits, one purpose each.
- Message: `type: short summary` in the imperative, under 72 chars.
  `feat: record transaction with balance preview`, `fix: keep category when editing transaction`.
- Schema change and its migration SQL go in the **same commit** as the code that uses them.
- Tests ship with the logic they cover.

## Before every commit

```bash
git diff --staged          # read it: no debug code, no commented-out code
bun test                   # must pass
```

Confirm none of these are staged: `.env`, `node_modules`, `dist`, database dumps (`*.sql` backups), logs.

## Before merging

1. `bun test` and the type check pass on the branch.
2. Ask `@reviewer` to review the diff. Fix every blocker.
3. If the schema changed: `database-migration` checklist done, `BACKGROUND_SCHEMA.md` updated.
4. Tick the finished item in `docs/IMPLEMENTATION_PLAN.md`.

## Rules

- Never `git push`, force-push, or rewrite shared history unless the owner asks.
- Never commit secrets. If one was committed, treat it as leaked: rotate it, then remove it from history.
- Do not commit generated output or large binaries.

## Undo safely

| Want to | Use |
|---------|-----|
| Unstage a file | `git restore --staged <file>` |
| Discard edits to one file | `git restore <file>` (cannot be undone) |
| Undo the last commit, keep the changes | `git reset --soft HEAD~1` (only if not pushed) |
| Undo a commit that is already shared | `git revert <sha>` |

Avoid `git reset --hard` and `git clean -fd` unless the owner explicitly asks.

## Done when

The branch has focused commits, tests pass, no secrets or generated files are tracked, and the plan checkbox is ticked.
