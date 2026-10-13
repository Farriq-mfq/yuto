import { expect, test, type Page } from "@playwright/test";

// Minimal Node typing untuk process.env (hindari @types/node).
declare const process: { env: Record<string, string | undefined> };

/**
 * Smoke E2E Yuto (Jalankan manual, berurutan):
 *
 *   1. Install browser sekali:      bunx playwright install chromium
 *   2. Start API (contoh test-only, JANGAN pakai secret prod):
 *        DATABASE_URL="postgres://yuto_test:<pass>@localhost:5432/yuto_test" \
 *        YUTO_PASSWORD="e2e-test-owner-pass" \
 *        JWT_SECRET="0123456789abcdef0123456789abcdef" \
 *        NODE_ENV=test PORT=3000 bun run --cwd apps/api src/index.ts
 *      Pastikan migrasi + seed kategori sudah jalan di yuto_test.
 *   3. Start web:                   bun run --cwd apps/web dev   # :5173
 *   4. Run:  E2E_YUTO_PASSWORD="e2e-test-owner-pass" bun run test:e2e
 *
 * Password diambil dari env E2E_YUTO_PASSWORD (default kuat, samakan
 * dengan YUTO_PASSWORD milik API saat run). retries=0 (lihat config):
 * flaky harus terlihat, bukan disembunyikan retry.
 */

const PASSWORD = process.env.E2E_YUTO_PASSWORD ?? "e2e-test-owner-pass";
// Tag unik per-run: SEMUA entitas (akun, transaksi, transfer) memakainya
// agar cleanup afterEach/finally bisa menyapu bersih walau test gagal.
const TAG = `E2E ${Date.now()}`;
const ACCOUNT_A = `${TAG} A`;
const ACCOUNT_B = `${TAG} B`;
const ACCOUNT_CATEGORY = `${TAG} Cat`;
const TX_TITLE = `${TAG} Kopi`;
const TRANSFER_NOTE = `${TAG} TR`;

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
  await page.getByLabel("Kategori akun").fill(ACCOUNT_CATEGORY);
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
  await page.getByLabel("Nominal").fill("25000");
  await page.getByLabel("Judul").fill(opts.title);
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  // Kembali ke Home, baris baru tampil paling atas.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: opts.title })).toBeVisible();
}

async function transfer(
  page: Page,
  opts: { fromName: string; toName: string; note: string },
): Promise<void> {
  await page.goto("/transfer");
  await page.getByLabel("Dari akun").click();
  await page.getByRole("option", { name: opts.fromName }).click();
  await page.getByLabel("Ke akun").click();
  await page.getByRole("option", { name: opts.toName }).click();
  await page.getByLabel("Nominal").fill("100000");
  await page.getByLabel("Catatan").fill(opts.note);
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);
}

/**
 * Sapu bersih SEMUA entitas bertag run ini via API (pakai sesi cookie
 * browser yang sama). Urutan penting: transfer -> transaksi -> akun,
 * karena hapus akun ditolak bila masih punya transaksi/transfer.
 * Best-effort: tak boleh melempar agar failure asli test tetap terlihat.
 */
async function cleanup(page: Page, tag: string): Promise<void> {
  const req = page.request;
  try {
    const res = await req.get("/api/transfers?limit=100");
    if (res.ok()) {
      const items = (await res.json()) as Array<{
        id: string;
        note?: string | null;
      }>;
      for (const item of items) {
        if (item.note && item.note.includes(tag)) {
          await req.delete(`/api/transfers/${item.id}`).catch(() => null);
        }
      }
    }
  } catch {
    /* abaikan: cleanup best-effort */
  }
  try {
    const res = await req.get(`/api/transactions?month=${jakartaMonth()}`);
    if (res.ok()) {
      const items = (await res.json()) as Array<{
        id: string;
        title: string;
      }>;
      for (const item of items) {
        if (item.title.includes(tag)) {
          await req.delete(`/api/transactions/${item.id}`).catch(() => null);
        }
      }
    }
  } catch {
    /* abaikan: cleanup best-effort */
  }
  try {
    const res = await req.get("/api/accounts/summary");
    if (res.ok()) {
      const data = (await res.json()) as {
        accounts: Array<{ id: string; name: string }>;
      };
      for (const account of data.accounts) {
        if (account.name.includes(tag)) {
          await req.delete(`/api/accounts/${account.id}`).catch(() => null);
        }
      }
    }
  } catch {
    /* abaikan: cleanup best-effort */
  }
}

test("smoke: login → akun → catat → home → transfer → laporan", async ({
  page,
}) => {
  try {
    await login(page);
    const categoryName = await pickExpenseCategory(page);

    await createAccount(page, {
      name: ACCOUNT_A,
      institution: `${TAG} Bank A`,
      balance: "1000000",
    });
    await createAccount(page, {
      name: ACCOUNT_B,
      institution: `${TAG} Bank B`,
      balance: "500000",
    });

    await recordExpense(page, {
      accountName: ACCOUNT_A,
      categoryName,
      title: TX_TITLE,
    });

    await transfer(page, {
      fromName: ACCOUNT_A,
      toName: ACCOUNT_B,
      note: TRANSFER_NOTE,
    });

    // Transfer tercatat di riwayat.
    await page.goto("/transfer");
    await expect(page.getByText(TRANSFER_NOTE).first()).toBeVisible();

    // Laporan menampilkan kategori pengeluaran bulan ini.
    await page.goto("/reports");
    await expect(
      page.getByRole("button", { name: categoryName }).first(),
    ).toBeVisible();
  } finally {
    await cleanup(page, TAG);
  }
});
