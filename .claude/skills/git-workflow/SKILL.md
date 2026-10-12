---
name: git-workflow
description: Git conventions for Yuto. Use when starting a task, branching, committing, preparing a merge, or undoing a mistake.
---

# Git workflow (Yuto)

## Start

1. Never work on `main`. If the working tree has unrelated changes, commit or stash them first.
2. Always create a new branch from an up-to-date main (if this task already has a branch, switch to it instead):
   `git switch main && git pull --ff-only && git switch -c feat/<short-name>`
   Prefixes: `feat/`, `fix/`, `test/`, `docs/`, `chore/`, `refactor/`.
3. One branch = one task from `docs/IMPLEMENTATION_PLAN.md`.

## Work loop

- Small commits, one purpose each.
- Message: `type: short summary` in the imperative, under 72 chars.
- Breaking change (operator must act): `feat!: ...` or a `BREAKING CHANGE:` footer. Types drive the version; see skill `release-tagging`.
  `feat: record transaction with balance preview`, `fix: keep category when editing transaction`.
- Schema change and its migration SQL go in the **same commit** as the code that uses them.
- Tests ship with the logic they cover.

## Push (always)

- First push: `git push -u origin <branch>`. After that: `git push`.
- Push when the task's tests pass, and again after every later commit.
- No `origin` remote? Stop and tell the owner. Do not add a remote or create the repository.
- After pushing, check CI on GitHub (`.github/workflows/ci.yml`). If it fails, fix it on the same branch and push again.

## Before every commit

```bash
git diff --staged          # read it: no debug code, no commented-out code
bun test                   # must pass
```

Confirm none of these are staged: `.env`, `node_modules`, `dist`, database dumps (`*.sql` backups), logs.

## Before merging

1. `bun test` and the type check pass on the branch, and CI is green on GitHub.
2. Ask `@reviewer` to review the diff. Fix every blocker.
3. If the schema changed: `database-migration` checklist done, `BACKGROUND_SCHEMA.md` updated.
4. Tick the finished item in `docs/IMPLEMENTATION_PLAN.md`.

## Rules

- Push only your own task branch to `origin`. Never push to `main`/`master`, never force-push, never delete remote branches.
- Merging into `main` is the owner's job, through a GitHub pull request.
- Never create, move, delete, or push tags. Releases are tagged by the owner (skill `release-tagging`).
- Never commit secrets. If one was committed, treat it as leaked: rotate it, then remove it from history.
- Do not commit generated output or large binaries.

## Undo safely

| Want to                                | Use                                            |
| -------------------------------------- | ---------------------------------------------- |
| Unstage a file                         | `git restore --staged <file>`                  |
| Discard edits to one file              | `git restore <file>` (cannot be undone)        |
| Undo the last commit, keep the changes | `git reset --soft HEAD~1` (only if not pushed) |
| Undo a commit that is already shared   | `git revert <sha>`                             |

Avoid `git reset --hard` and `git clean -fd` unless the owner explicitly asks.

## Done when

The branch has focused commits, tests pass, no secrets or generated files are tracked, the plan checkbox is ticked, and the branch is pushed with a green CI run.
