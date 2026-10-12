# Git rules

- Never commit on `main`. Every task starts on a new branch from an up-to-date main:
  `git switch main && git pull --ff-only && git switch -c feat/<short-name>`.
  If the task already has a branch, continue on it.
- Branch names: `feat/`, `fix/`, `test/`, `docs/`, `chore/`, `refactor/` + short name. One branch per plan task.
- Small commits, one purpose each. Message: `type: short summary` (`feat`, `fix`, `perf`, `test`, `docs`, `chore`, `refactor`, `ci`).
- Breaking change (the operator must act: new or removed env var, manual migration step, changed backup/restore): `feat!: summary` or a `BREAKING CHANGE:` footer. Commit types decide the next version (skill `release-tagging`).
- Agents never create, move, delete, or push tags. The owner tags releases as `vMAJOR.MINOR.PATCH`.
- Always push the task branch to GitHub: `git push -u origin <branch>` the first time, `git push` after. Push when the task's tests pass and after every later commit.
- Push only to your own task branch. Never push to `main` or `master`. Never force-push. Never delete remote branches.
- No `origin` remote? Stop and tell the owner. Do not add a remote or create a repository.
- After pushing, CI (`.github/workflows/ci.yml`) must pass. If it fails, fix it on the same branch.
- Merging into `main` is the owner's job through a GitHub pull request, not the agent's.
- Never commit `.env`, database backups, generated build output, or `node_modules`.
- Schema changes and their migration SQL go in the same commit.
