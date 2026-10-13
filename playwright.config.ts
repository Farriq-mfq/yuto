import { defineConfig } from "@playwright/test";

// Minimal Node typing untuk process.env (hindari @types/node).
declare const process: { env: Record<string, string | undefined> };

// Smoke E2E Yuto: browser vs web Vite (proxy /api -> API).
// Default :5173 (web) -> :3000 (API). Bila port default dipakai
// instans lain (mis. dev stack paralel), override keduanya:
//   E2E_BASE_URL=http://localhost:5174 bunx playwright test
// dengan web dijalankan sbg:
//   VITE_PROXY_TARGET=http://localhost:3100 bun run --cwd apps/web dev -- --port 5174
// API + web dijalankan manual sebelum `playwright test`
// (lihat e2e/smoke.e2e.ts header). 0 retry agar flaky tidak tersembunyi.
export default defineConfig({
  testDir: "./e2e",
  // why: pola default Playwright (test|spec) menabrak `bun test` yang juga
  // mengeksekusi *.spec.ts — sufiks .e2e.ts hanya untuk Playwright.
  testMatch: "**/*.e2e.ts",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless: true,
  },
});
