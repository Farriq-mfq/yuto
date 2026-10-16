import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { getEnv, type Env } from "./lib/env";
import { errorResponse } from "./lib/errors";
import { authRoutes } from "./modules/auth/routes";
import { SESSION_COOKIE, verifySessionToken } from "./modules/auth/service";
import { accountRoutes } from "./modules/accounts/routes";
import { categoryRoutes } from "./modules/categories/routes";
import { reportRoutes } from "./modules/reports/routes";
import { syncRoutes } from "./modules/sync/routes";
import { transactionRoutes } from "./modules/transactions/routes";
import { transferRoutes } from "./modules/transfers/routes";

// /api/sync/pair is public like /auth/login: the owner password in the body
// is the only credential, so no session is needed to pair a first device.
const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth/login",
  "/api/config",
  "/api/sync/pair",
];

// Device sync over bearer tokens ONLY: the session cookie never
// authenticates these paths. The sync module verifies the device token
// itself; everything else under /api/sync/* (devices registry) keeps the
// cookie guard so only the owner in a browser can manage devices.
function isSyncBearerPath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return pathname === "/api/sync/push" || pathname === "/api/sync/pull";
}

export function createApp(env: Env = getEnv()) {
  return new Elysia()
    // why: aplikasi native (origin https://localhost di WebView Android,
    // capacitor://localhost di iOS) menembak API langsung lintas-origin
    // (pair/push/pull pakai Bearer, bukan cookie) — tanpa ini preflight
    // OPTIONS gagal dan HP hanya bisa sync via proxy dev. Didaftarkan
    // PERTAMA agar preflight lolos sebelum guard sesi. Origin eksplisit
    // (bukan *) agar respons kredensial tak bocor ke situs asing.
    .use(
      cors({
        origin: ["https://localhost", "capacitor://localhost"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    )
    .onBeforeHandle(async ({ path, cookie, set }) => {
      if (PUBLIC_PATHS.includes(path) || isSyncBearerPath(path)) return;
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
        // Public on purpose: a boolean UI switch, not a secret.
        .get("/config", () => ({ mapEnabled: env.mapEnabled }))
        .use(authRoutes(env))
        .use(accountRoutes())
        .use(categoryRoutes())
        .use(reportRoutes())
        .use(syncRoutes(env))
        .use(transactionRoutes())
        .use(transferRoutes()),
    );
}

export const app = createApp();

export type App = typeof app;
