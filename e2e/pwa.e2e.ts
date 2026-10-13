import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Minimal Node typing untuk process.env (hindari @types/node).
declare const process: { env: Record<string, string | undefined> };

/**
 * PWA E2E Yuto (server manual, PROD build — vite dev menonaktifkan SW):
 *
 *   1. Start API test-only (JANGAN pakai secret prod):
 *        YUTO_API_PORT=3227 bun ~/AppData/Local/Temp/opencode/yuto-pwa-env.ts \
 *          bun src/index.ts                      # dari apps/api
 *      Pastikan migrasi + seed kategori sudah jalan di yuto_test.
 *   2. Build prod:                 bun run --cwd apps/web build
 *   3. Serve dist + proxy /api ke API (contoh skrip test-only
 *      yuto-pwa-preview.ts di Temp):  WEB_PORT=5187 YUTO_API_PORT=3227 \
 *        bun ~/AppData/Local/Temp/opencode/yuto-pwa-preview.ts
 *   4. Run:  E2E_BASE_URL=http://localhost:5187 \
 *        E2E_YUTO_PASSWORD="e2e-test-owner-pass" bunx playwright test e2e/pwa.e2e.ts
 *
 * Password diambil dari env E2E_YUTO_PASSWORD (samakan dengan
 * YUTO_PASSWORD milik API saat run). retries=0 (lihat config):
 * flaky harus terlihat, bukan disembunyikan retry.
 *
 * Catatan: toast update "Versi baru tersedia" DIUJI di sini
 * ("pwa: toast update setelah build baru") lewat orkestrasi dua build di
 * dalam test. Pernah di-skip saat guard `showPrompt` salah membaca tuple
 * `needRefresh` (selalu false di prod); guard sudah membaca tuple
 * (`needRefresh[0]`) sehingga toast tampil saat worker baru `waiting`.
 */

const PASSWORD = process.env.E2E_YUTO_PASSWORD ?? "e2e-test-owner-pass";
// Tag unik per-run: SEMUA entitas (akun, transaksi) memakainya agar
// cleanup finally bisa menyapu bersih walau test gagal.
const TAG = `PWA ${Date.now()}`;
const ACCOUNT = `${TAG} Dompet`;
const TX_TITLE = `${TAG} Kopi`;
const TX_AMOUNT = 25000;
// Nominal terformat id-ID seperti formatRupiah (Intl currency IDR).
const EXPECTED_NOMINAL = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(TX_AMOUNT);

// Akar repo dari lokasi file ini (e2e/ -> repo/). Dipakai test toast
// update untuk mutasi sementara + rebuild web di dalam test.
const REPO_ROOT = join(__dirname, "..");
const STRINGS_PATH = join(REPO_ROOT, "apps/web/src/strings.ts");
// Satu-satunya string yang dimutasi sementara oleh test toast update:
// subtitle login (ter-bundle ke JS sehingga hash berubah, terlihat di
// /login, dan tidak di-assert test lain).
const LOGIN_SUBTITLE_LINE =
  'loginSubtitle: "Masukkan kata sandi pemilik untuk membuka data keuanganmu.",';
const UPDATE_PROBE_MARKER = " (pembaruan-uji)";

/** Build prod web (build-A maupun build-B bagi test toast update). */
function buildWeb(): void {
  execFileSync("bun", ["run", "--cwd", "apps/web", "build"], {
    cwd: REPO_ROOT,
    timeout: 240_000,
    stdio: "pipe",
  });
}

/** Bulan `YYYY-MM` zona Asia/Jakarta (batas bulan 00:00 WIB). */
function jakartaMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Ambil nama kategori pengeluaran nyata dari API (seed bisa berbeda). */
async function pickExpenseCategory(page: Page): Promise<string> {
  const res = await page.request.get("/api/categories");
  expect(res.ok()).toBeTruthy();
  const categories = (await res.json()) as Array<{
    id: string;
    name: string;
    kind: string;
  }>;
  const expense = categories.filter((c) => c.kind === "expense");
  expect(expense.length).toBeGreaterThan(0);
  return (
    expense.find((c) => c.name === "Makanan & Minuman") ?? expense[0]
  ).name;
}

async function createAccount(
  page: Page,
  opts: { name: string; institution: string; balance: string },
): Promise<void> {
  await page.goto("/wallet/new");
  await expect(
    page.getByRole("heading", { name: "Akun baru" }),
  ).toBeVisible();
  // Jalur deterministik: institusi "Lainnya…" + teks bebas unik.
  await page.getByLabel("Institusi").click();
  await page.getByRole("option", { name: "Lainnya…", exact: true }).click();
  await page.getByLabel("Nama institusi lain").fill(opts.institution);
  await page.getByLabel("Nama kustom").fill(opts.name);
  await page.getByLabel("Kategori akun").fill(`${TAG} Cat`);
  await page.getByLabel("Saldo awal").fill(opts.balance);
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(page.getByRole("link", { name: opts.name })).toBeVisible();
}

async function recordExpense(
  page: Page,
  opts: { accountName: string; categoryName: string; title: string },
): Promise<void> {
  await page.goto("/record");
  await page.getByLabel("Akun").click();
  await page.getByRole("option", { name: opts.accountName }).click();
  await page.getByLabel("Kategori").click();
  await page.getByRole("option", { name: opts.categoryName }).click();
  await page.getByLabel("Nominal").fill(String(TX_AMOUNT));
  await page.getByLabel("Judul").fill(opts.title);
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  // Kembali ke Home, baris baru tampil paling atas.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: opts.title })).toBeVisible();
}

/**
 * Tunggu service worker aktif + halaman dikontrol SW. Reload online
 * diperlukan: load pertama meregistrasi SW tapi belum dikontrol
 * (clientsClaim=false), navigasi berikutnya baru dikontrol.
 */
async function waitForControlledSW(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      navigator.serviceWorker.ready.then((reg) => reg.active !== null),
    null,
    { timeout: 20_000 },
  );
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.navigator.serviceWorker.controller?.state ?? "none",
        ),
      { timeout: 20_000 },
    )
    .toBe("activated");
}

/**
 * Sapu bersih SEMUA entitas bertag run ini via API (pakai sesi cookie
 * browser yang sama). Urutan penting: transaksi -> akun, karena hapus
 * akun ditolak bila masih punya transaksi. Best-effort: tak boleh
 * melempar agar failure asli test tetap terlihat.
 */
async function cleanup(page: Page, tag: string): Promise<void> {
  try {
    const res = await page.request.get(`/api/transactions?month=${jakartaMonth()}`);
    if (res.ok()) {
      const items = (await res.json()) as Array<{
        id: string;
        title: string;
      }>;
      for (const item of items) {
        if (item.title.includes(tag)) {
          await page.request.delete(`/api/transactions/${item.id}`).catch(() => null);
        }
      }
    }
  } catch {
    /* abaikan: cleanup best-effort */
  }
  try {
    const res = await page.request.get("/api/accounts/summary");
    if (res.ok()) {
      const data = (await res.json()) as {
        accounts: Array<{ id: string; name: string }>;
      };
      for (const account of data.accounts) {
        if (account.name.includes(tag)) {
          await page.request.delete(`/api/accounts/${account.id}`).catch(() => null);
        }
      }
    }
  } catch {
    /* abaikan: cleanup best-effort */
  }
}

test("pwa: manifest terserve dan valid", async ({ page }) => {
  // Link manifest ada di HTML.
  await page.goto("/");
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");

  // Manifest terserve dari konteks halaman + JSON valid + field wajib.
  const manifest = (await page.evaluate(async () => {
    const res = await fetch("/manifest.webmanifest");
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      json: (await res.json()) as unknown,
    };
  })) as {
    status: number;
    contentType: string | null;
    json: {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
    };
  };
  expect(manifest.status).toBe(200);
  expect(manifest.contentType ?? "").toContain("manifest+json");
  expect(manifest.json.name).toBe("Yuto");
  expect(manifest.json.short_name).toBe("Yuto");
  expect(manifest.json.start_url).toBe("/");
  expect(manifest.json.display).toBe("standalone");
  const icons = manifest.json.icons ?? [];
  expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
  expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
  expect(icons.some((i) => (i.purpose ?? "").includes("maskable"))).toBe(
    true,
  );

  // Setiap ikon yang dideklarasikan benar-benar terserve (bisa diinstal).
  for (const icon of icons) {
    const status = await page.evaluate(async (src: string) => {
      const res = await fetch(src);
      return res.status;
    }, icon.src ?? "");
    expect({ src: icon.src, status }).toEqual({ src: icon.src, status: 200 });
  }
});

test("pwa: service worker aktif dan sw.js terserve", async ({ page }) => {
  await page.goto("/");
  await waitForControlledSW(page);

  const swStatus = await page.evaluate(async () => {
    const res = await fetch("/sw.js");
    return res.status;
  });
  expect(swStatus).toBe(200);
});

test(
  "pwa: toast update setelah build baru",
  { timeout: 300_000 },
  async ({ page }) => {
    // Orkestrasi dua build di dalam test (self-contained, ~12 dtk):
    // build-A dari src pristine -> SW mengontrol halaman -> ubah 1 string
    // visual sementara -> rebuild (build-B; preview serve dist dari disk
    // per-request sehingga tanpa restart) -> reload + update() -> worker
    // baru `waiting` -> toast "Versi baru tersedia" -> klik "Muat ulang"
    // -> halaman reload normal dengan konten versi baru.
    const original = readFileSync(STRINGS_PATH, "utf8");
    // Fail-fast bila run sebelumnya abort sebelum restore (file kotor).
    expect(original).toContain(LOGIN_SUBTITLE_LINE);
    expect(original).not.toContain(UPDATE_PROBE_MARKER);
    try {
      buildWeb();
      await page.goto("/login");
      await waitForControlledSW(page);

      writeFileSync(
        STRINGS_PATH,
        original.replace(
          LOGIN_SUBTITLE_LINE,
          LOGIN_SUBTITLE_LINE.replace(
            'keuanganmu."',
            `keuanganmu${UPDATE_PROBE_MARKER}."`,
          ),
        ),
        "utf8",
      );
      buildWeb();

      // Seperti cek update browser/revisit: paksa SW memeriksa sw.js baru.
      await page.reload();
      await page.evaluate(() =>
        navigator.serviceWorker.ready.then((reg) => reg.update()),
      );

      await expect(page.getByText("Versi baru tersedia")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: "Muat ulang" }),
      ).toBeVisible();

      // updateServiceWorker(true) me-reload sendiri; tetap di /login lalu
      // pastikan konten versi baru (marker) tampil dan halaman normal.
      await page.getByRole("button", { name: "Muat ulang" }).click();
      await page.waitForLoadState("load");
      await expect(page.getByText("pembaruan-uji")).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      writeFileSync(STRINGS_PATH, original, "utf8");
    }
    // Restore byte-identik: isi sama persis seperti sebelum test.
    expect(readFileSync(STRINGS_PATH, "utf8")).toBe(original);
  },
);

test("pwa: offline tampil banner dan tanpa data /api dari cache", async ({
  page,
  context,
}) => {
  try {
    await login(page);
    const categoryName = await pickExpenseCategory(page);
    await createAccount(page, {
      name: ACCOUNT,
      institution: `${TAG} Bank`,
      balance: "1000000",
    });
    await recordExpense(page, {
      accountName: ACCOUNT,
      categoryName,
      title: TX_TITLE,
    });

    // Data terlihat saat online (sanity: yang disembunyikan offline itu ini).
    await page.goto("/");
    await expect(page.getByRole("link", { name: TX_TITLE })).toBeVisible();
    await expect(page.getByText(EXPECTED_NOMINAL).first()).toBeVisible();

    // Pastikan SW mengontrol halaman sebelum memutus jaringan.
    await waitForControlledSW(page);

    // Putus jaringan → reload: app shell dari SW, /api/* gagal total.
    await context.setOffline(true);
    try {
      await page.goto("/");
      // Banner offline tampil. Catatan: getByRole(status, {name})
      // tak cocok di Chromium (AX tree memberi nama kosong), jadi
      // assert role polos + teks banner secara terpisah.
      await expect(page.getByRole("status")).toBeVisible();
      await expect(page.getByText(/sedang offline/i)).toBeVisible();
      // Nominal + judul transaksi spesifik TIDAK tampil dari cache.
      await expect(page.getByText(EXPECTED_NOMINAL)).toBeHidden();
      await expect(page.getByRole("link", { name: TX_TITLE })).toBeHidden();
      // App jujur: state error (gagal memuat), bukan daftar basi.
      await expect(page.getByText(/gagal memuat data/i)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    // Online lagi: data kembali tampil (sanity pemulihan).
    await page.goto("/");
    await expect(page.getByRole("link", { name: TX_TITLE })).toBeVisible();
  } finally {
    await cleanup(page, TAG);
  }
});
