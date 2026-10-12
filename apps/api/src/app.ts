import { Elysia } from "elysia";
import { getEnv, type Env } from "./lib/env";
import { errorResponse } from "./lib/errors";
import { authRoutes } from "./modules/auth/routes";
import { SESSION_COOKIE, verifySessionToken } from "./modules/auth/service";
import { accountRoutes } from "./modules/accounts/routes";
import { categoryRoutes } from "./modules/categories/routes";

const PUBLIC_PATHS = ["/api/health", "/api/auth/login"];

export function createApp(env: Env = getEnv()) {
  return new Elysia()
    .onBeforeHandle(async ({ path, cookie, set }) => {
      if (PUBLIC_PATHS.includes(path)) return;
      const token = cookie[SESSION_COOKIE]?.value;
      const valid =
        typeof token === "string" &&
        (await verifySessionToken(token, env.jwtSecret));
      if (!valid) {
        set.status = 401;
        return errorResponse(
          "UNAUTHORIZED",
          "Login diperlukan. Silakan masuk kembali.",
        );
      }
    })
    .onError(({ code, set }) => {
      // Declared before the routes: Elysia 1.4 only sends VALIDATION
      // errors to onError handlers registered before the route.
      if (code === "VALIDATION") {
        set.status = 400;
        return errorResponse("VALIDATION", "Input tidak valid.");
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return errorResponse("NOT_FOUND", "Tidak ditemukan.");
      }
      set.status = 500;
      return errorResponse("INTERNAL", "Terjadi kesalahan di server.");
    })
    .group("/api", (group) =>
      group
        .get("/health", () => ({ status: "ok" as const }))
        .use(authRoutes(env))
        .use(accountRoutes())
        .use(categoryRoutes()),
    );
}

export const app = createApp();

export type App = typeof app;
