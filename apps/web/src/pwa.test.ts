import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "./strings";

const WEB_ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

describe("PWA manifest (public/manifest.webmanifest)", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  test("field wajib sesuai spec Phase 6 (PWA)", () => {
    expect(manifest.name).toBe("Yuto");
    expect(manifest.short_name).toBe("Yuto");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("id");
    expect(typeof manifest.theme_color).toBe("string");
    expect(typeof manifest.background_color).toBe("string");
  });

  test("ikon 192/512/maskable ada dan filenya ada di public/", () => {
    const icons = manifest.icons as Array<{
      src: string;
      sizes: string;
      purpose?: string;
    }>;
    const bySize = (sizes: string, purpose?: string) =>
      icons.find(
        (i) => i.sizes === sizes && (!purpose || i.purpose === purpose),
      );
    expect(bySize("192x192")).toBeDefined();
    expect(bySize("512x512")).toBeDefined();
    expect(bySize("512x512", "maskable")).toBeDefined();
    for (const icon of icons) {
      if (icon.src.startsWith("/")) {
        expect(existsSync(join(WEB_ROOT, "public", icon.src.slice(1)))).toBe(
          true,
        );
      }
    }
  });

  test("file ikon PWA ada di public/", () => {
    for (const file of [
      "public/icon-192.png",
      "public/icon-512.png",
      "public/maskable-512.png",
      "public/apple-touch-icon.png",
      "public/favicon-32x32.png",
      "public/favicon-16x16.png",
      "public/favicon.svg",
    ]) {
      expect(existsSync(join(WEB_ROOT, file))).toBe(true);
    }
  });
});

describe("konfigurasi service worker (vite.config.ts)", () => {
  const config = read("vite.config.ts");

  test("prompt mode + navigasi SPA mengecualikan /api/", () => {
    expect(config).toContain("registerType");
    expect(config).toContain("prompt");
    expect(config).toContain("navigateFallbackDenylist");
    expect(config).toContain("/api/");
  });

  test("tidak ada runtimeCaching (data /api/* dan tile OSM tak di-cache)", () => {
    // Abaikan komentar baris agar kata di komentar tidak dihitung.
    const code = config.replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("runtimeCaching");
  });
});

describe("strings PWA (Indonesia)", () => {
  test("update + offline terisi", () => {
    expect(strings.updateAvailableTitle).toBe("Versi baru tersedia");
    expect(strings.updateReload.length).toBeGreaterThan(0);
    expect(strings.updateAvailableHint.length).toBeGreaterThan(0);
    expect(strings.offlineMessage.length).toBeGreaterThan(0);
  });
});

// Hanya bermakna setelah `bun run --cwd apps/web build` (dist/ ada).
// `describe.if` tidak dipakai: guard di dalam tiap test agar skip-nya
// eksplisit di semua runner (bun lama mengeksekusi body describe.if!).
describe("output build service worker (dist/)", () => {
  const swPath = join(WEB_ROOT, "dist", "sw.js");
  function readDist(): string | null {
    if (!existsSync(swPath)) {
      console.log(
        "SKIP dist/: build web dulu (`bun run --cwd apps/web build`).",
      );
      return null;
    }
    return readFileSync(swPath, "utf8");
  }

  test("sw.js + workbox ada", () => {
    const sw = readDist();
    if (sw === null) return;
    expect(sw).toContain("precacheAndRoute");
    expect(existsSync(join(WEB_ROOT, "dist", "manifest.webmanifest"))).toBe(
      true,
    );
  });

  test("denylist /api/ ikut ter-build", () => {
    const sw = readDist();
    if (sw === null) return;
    // Regex denylist ter-build dalam bentuk escaped: /^\/api\//.
    expect(sw).toContain("\\/api\\/");
  });

  test("tidak ada URL /api/ di precache manifest", () => {
    const sw = readDist();
    if (sw === null) return;
    const urls = [...sw.matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.includes("api"))).toEqual([]);
  });

  test("tanpa strategi runtime caching", () => {
    const sw = readDist();
    if (sw === null) return;
    for (const strategy of [
      "NetworkFirst",
      "StaleWhileRevalidate",
      "CacheFirst",
      "NetworkOnly",
      "CacheOnly",
    ]) {
      expect(sw).not.toContain(strategy);
    }
  });
});
