import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Minimal Node typing for this config file (avoids an @types/node dependency).
declare const process: { env: Record<string, string | undefined> };

// In Docker dev the API is reachable as http://api:3000 (compose service name);
// locally it is http://localhost:3000. Override with VITE_PROXY_TARGET when needed.
const apiTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // file:// URL pathname avoids a node:path import (no @types/node here).
      "@": new URL("./src", import.meta.url).pathname,
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
