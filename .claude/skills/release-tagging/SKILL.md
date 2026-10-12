---
name: release-tagging
description: Choose the next semantic version and cut a tagged GitHub release for Yuto. Use when the owner wants to release, asks what the next version number is, or asks what bump a set of changes needs.
---

# Release tagging (semantic versioning)

**Owner only.** Agents propose the version and the commands. Agents never run `git tag` or push a tag (denied in the permissions).

## Format

`vMAJOR.MINOR.PATCH`, annotated tags. Prerelease: `v0.2.0-rc.1`. The git tag is the only source of the version; do not keep a version number in `package.json`.

## What counts as breaking

Yuto is self-hosted, so **breaking = the operator must do something** when upgrading:
new or removed or renamed env var, a migration that needs a manual step, a changed backup/restore procedure.
A changed internal API is not breaking, because web and API ship together.

## Choosing the bump

List commits since the last tag (first release: all commits):

```bash
git log "$(git describe --tags --abbrev=0)"..HEAD --oneline
```

Highest wins:

| Commits contain                                | Bump (0.x) | Bump (1.0 and later) |
| ---------------------------------------------- | ---------- | -------------------- |
| `type!:` or `BREAKING CHANGE:`                 | MINOR      | MAJOR                |
| `feat`                                         | MINOR      | MINOR                |
| `fix`, `perf`                                  | PATCH      | PATCH                |
| only `docs`, `test`, `chore`, `refactor`, `ci` | no release | no release           |

Milestones: **v0.1.0** when Phase 2 (Core) is done and usable. **v1.0.0** when Phase 5 is done, including the tested restore, and the owner trusts it with real data.

## Steps

1. CI on the latest `main` commit is green.
2. `git switch main && git pull --ff-only`
3. Show the owner the commit list, the chosen bump, and why.
4. If the release has a migration or env change, prepare upgrade notes (below).
5. Owner runs:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
6. `.github/workflows/release.yml` checks the tag format and that it is on `main`, then creates the GitHub Release with generated notes (`-` in the tag marks it as a prerelease). Check the Actions run and the Releases page.
7. If there are upgrade notes, add them to the release description.

## Upgrade notes template

```
### Upgrade
1. Back up: docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB > yuto-$(date +%F).sql
2. git fetch --tags && git checkout vX.Y.Z
3. Add to .env: <only if new/changed variables>
4. docker compose up -d --build
```

## Rollback

Migrations only move forward. To go back: restore the backup taken before the upgrade, check out the previous tag, rebuild.

## Mistakes

- Never move or delete a published tag. If a release is wrong, publish a new PATCH version.
- A tag that was never pushed can be removed: `git tag -d vX.Y.Z`.

## Done when

The tag is on `main`, the release workflow is green, the GitHub Release exists, and upgrade notes are present when needed.
