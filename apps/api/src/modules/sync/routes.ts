import { Elysia, t } from "elysia";
import type { Env } from "../../lib/env";
import { errorResponse, tooManyAttempts, wrongPassword } from "../../lib/errors";
import {
  clearFailures,
  getClientIp,
  isLimited,
  recordFailure,
} from "../../lib/rate-limit";
import {
  authenticateDevice,
  listDevices,
  pairDevice,
  pullSync,
  pushSync,
  revokeDevice,
} from "./service";

const pairBody = t.Object({
  password: t.String({ minLength: 1 }),
  deviceName: t.String({ minLength: 1, maxLength: 80 }),
});

// Loose on purpose: strict per-field schemas would 400 the whole batch on
// the first bad row. The service validates each row itself and reports
// per-row { id, code, message } in `rejected` with an overall 200.
const pushBody = t.Object({
  accounts: t.Optional(t.Array(t.Any())),
  transactions: t.Optional(t.Array(t.Any())),
  transfers: t.Optional(t.Array(t.Any())),
});

const pullQuery = t.Object({
  since: t.Optional(t.String({ pattern: "^[0-9]+$" })),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

const deviceParams = t.Object({ id: t.String({ format: "uuid" }) });

const PULL_DEFAULT_LIMIT = 200;
const PULL_MAX_LIMIT = 500;

function unauthorizedDevice() {
  return errorResponse(
    "UNAUTHORIZED",
    "Perangkat tidak dikenal atau aksesnya sudah dicabut.",
  );
}

export function syncRoutes(env: Env) {
  return (
    new Elysia()
      .post(
        "/sync/pair",
        async ({ body, set, request, server }) => {
          const ip = getClientIp(request, server);
          // Same IP-keyed bucket as /auth/login: the shared helpers have no
          // per-path key, so brute-forcing either endpoint counts toward the
          // same 5-failures-per-minute limit. Documented, not separated.
          if (isLimited(ip)) {
            set.status = 429;
            return tooManyAttempts();
          }
          const paired = await pairDevice({
            password: body.password,
            deviceName: body.deviceName,
            expectedPassword: env.yutoPassword,
          });
          if (!paired) {
            recordFailure(ip);
            // Generic auth failure: same shape as login, nothing to enumerate.
            set.status = 401;
            return wrongPassword();
          }
          clearFailures(ip);
          return paired;
        },
        { body: pairBody },
      )
      .post(
        "/sync/push",
        // Bearer ONLY: the session cookie never authenticates here (the
        // global guard in app.ts skips these paths for exactly this reason).
        async ({ body, set, request }) => {
          const device = await authenticateDevice(
            request.headers.get("authorization"),
          );
          if (!device) {
            set.status = 401;
            return unauthorizedDevice();
          }
          return pushSync({
            accounts: body.accounts ?? [],
            transactions: body.transactions ?? [],
            transfers: body.transfers ?? [],
          });
        },
        { body: pushBody },
      )
      .get(
        "/sync/pull",
        // Bearer ONLY, same as push.
        async ({ query, set, request }) => {
          const device = await authenticateDevice(
            request.headers.get("authorization"),
          );
          if (!device) {
            set.status = 401;
            return unauthorizedDevice();
          }
          const since = query.since === undefined ? 0 : Number(query.since);
          if (!Number.isSafeInteger(since) || since < 0) {
            set.status = 400;
            return errorResponse("VALIDATION", "Parameter since tidak valid.");
          }
          const rawLimit = query.limit === undefined
            ? PULL_DEFAULT_LIMIT
            : Number(query.limit);
          const limit = Math.min(
            Math.max(Math.floor(rawLimit), 1),
            PULL_MAX_LIMIT,
          );
          return pullSync(since, limit);
        },
        { query: pullQuery },
      )
      // Device registry: cookie-owner auth (global session guard), NEVER
      // bearer — a device must not list or revoke other devices.
      .get("/sync/devices", async () => listDevices())
      .post(
        "/sync/devices/:id/revoke",
        async ({ params, set }) => {
          const result = await revokeDevice(params.id);
          if (result === "not-found") {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Perangkat tidak ditemukan.");
          }
          return { ok: true as const };
        },
        { params: deviceParams },
      )
  );
}
