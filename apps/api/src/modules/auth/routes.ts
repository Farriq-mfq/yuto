import { Elysia, t } from "elysia";
import type { Env } from "../../lib/env";
import {
  tooManyAttempts,
  unauthorized,
  wrongPassword,
} from "../../lib/errors";
import {
  clearFailures,
  getClientIp,
  isLimited,
  recordFailure,
} from "../../lib/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from "./service";

export function authRoutes(env: Env) {
  return new Elysia()
    .get("/auth/session", () => ({ ok: true as const }))
    .post(
      "/auth/login",
      async ({ body, cookie, set, request, server }) => {
        const ip = getClientIp(request, server);
        if (isLimited(ip)) {
          set.status = 429;
          return tooManyAttempts();
        }
        if (!verifyPassword(body.password, env.yutoPassword)) {
          recordFailure(ip);
          set.status = 401;
          return wrongPassword();
        }
        clearFailures(ip);
        const token = await createSessionToken(env.jwtSecret);
        const session = cookie[SESSION_COOKIE];
        if (session)
          session.set({
            value: token,
            httpOnly: true,
            sameSite: "lax",
            secure: env.cookieSecure,
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS,
          });
        return { ok: true };
      },
      {
        body: t.Object({
          password: t.String({ minLength: 1 }),
        }),
      },
    )
    .post("/auth/logout", ({ cookie }) => {
      cookie[SESSION_COOKIE]?.remove();
      return { ok: true };
    });
}
