---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "e2e/**"
---
# Testing rules
- Runner: `bun test`. One Playwright smoke test for the main flow.
- Integration tests use a real PostgreSQL (separate `*_test` database). Do not mock the DB.
- Each test creates its own data and does not depend on test order.
- Name tests by behavior: `"transfer rolls back both accounts when the second write fails"`.
- Must-have cases are listed in `docs/TRD.md` section 8. A change touching money, balances, auth, or reports is not done without them.
- Fix flaky tests; never add retries or sleeps to hide them.
