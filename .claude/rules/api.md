---
paths:
  - "apps/api/**"
---
# API rules (Elysia)
- Module layout: `modules/<name>/routes.ts` (HTTP + TypeBox validation) and `service.ts` (logic + DB). Routes never import the DB client.
- Validate body, query, and params with `t.*`. Never trust input.
- All routes are mounted under `/api`. Session guard on everything except `/auth/login` and `/health`.
- Single owner: no `userId` anywhere. Services take only the data they need.
- Errors use `{ error: { code, message } }` with `VALIDATION | NOT_FOUND | CONFLICT | UNAUTHORIZED`.
- Never log passwords, tokens, or request bodies of auth routes.
- Multi-row writes (transfer, transaction + items) run inside `db.transaction`.
- Export the app type (`export type App = typeof app`) so the web client stays typed via Eden.
