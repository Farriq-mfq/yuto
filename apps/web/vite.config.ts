import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Minimal Node typing for this config file (avoids an @types/node dependency).
declare const process: { env: Record<string, string | undefined> };

// In Docker dev the API is reachable as http://api:3000 (compose service name);
// locally it is http://localhost:3000. Override with VITE_PROXY_TARGET when needed.
const apiTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Prompt mode: versi baru TIDAK ditukar diam-diam; user menekan
      // "Muat ulang" di toast (PwaUpdatePrompt) → skipWaiting + reload.
      registerType: "prompt",
      // Registrasi manual via `virtual:pwa-register` agar bisa prompt.
      injectRegister: false,
      // Manifest dipelihara sebagai file terpisah agar bisa divalidasi
      // langsung: public/manifest.webmanifest.
      manifest: false,
      workbox: {
        // Precache HANYA app shell + font ter-bundle (woff2 dari
        // Fontsource ikut karena pola ini). Tidak ada runtimeCaching:
        // /api/* (data keuangan) dan tile OSM tidak pernah di-cache.
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}",
        ],
        // Bundle utama ~10 MB (leaflet + recharts + subset font, bawaan
        // sebelum PWA) sehingga butuh di atas default workbox 2 MiB agar
        // app shell tetap ter-precache.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // Navigasi SPA fallback ke index.html, kecuali request API.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      // file:// URL pathname avoids a node:path import (no @types/node here).
      "@": new URL("./src", import.meta.url).pathname,
      // why: SQL migrasi packages/local adalah sumber kebenaran skema SQLite;
      // nativeFactory mengimpornya via ?raw. Alias absolut diperlukan karena
      // Vite/rolldown menolak import relatif yang keluar dari root.
      "@yuto-migrations": new URL(
        "../../packages/local/drizzle",
        import.meta.url,
      ).pathname,
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      // Windows bind mounts into the dev container don't emit fs events reliably;
      // compose sets VITE_WATCH_POLLING=1 so HMR still picks up changes.
      usePolling: process.env.VITE_WATCH_POLLING === "1",
    },
    proxy: {
      "/api": apiTarget,
    },
  },
});
