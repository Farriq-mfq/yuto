## What and why
<!-- One or two sentences. -->

## Plan item
- [ ] Ticked in `docs/IMPLEMENTATION_PLAN.md` (only if finished and tested)

## Checklist
- [ ] `bun test` passes and CI is green
- [ ] Money is whole rupiah; balances are computed, never stored
- [ ] Schema change: migration SQL committed and `docs/BACKGROUND_SCHEMA.md` updated
- [ ] New route is behind the session guard and has a test that it returns 401 without a cookie
- [ ] No secrets, `.env`, or database backups committed
- [ ] No new outbound network call (or it is opt-in and documented in `docs/TRD.md`)
- [ ] UI uses semantic tokens (no hex) and text lives in `strings.ts`
