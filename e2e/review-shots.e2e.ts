import { expect, test } from "@playwright/test";

// Review visual SEMENTARA pembuat screenshot: login + semua layar utama.
// Output: screenshots/<alur>-<langkah>.png (viewport HP 390x844).
// Tidak membuat data (tanpa cleanup).

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SHOT = async (
  page: import("@playwright/test").Page,
  name: string,
) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `./screenshots/${name}.png` });
};

test("review: semua layar dan alur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // 01 login
  await page.goto("/login");
  await SHOT(page, "01-login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  // 02 home
  await SHOT(page, "02-home");
  // 03 wallet
  await page.getByRole("link", { name: /dompet/i }).click();
  await page.waitForURL("/wallet");
  await SHOT(page, "03-wallet");
  // 04 wallet-new
  await page.goto("/wallet/new");
  await page.getByRole("heading", { name: "Akun baru" }).waitFor({ timeout: 15000 });
  await SHOT(page, "04-wallet-new");
  // 05 transfer
  await page.goto("/transfer");
  await page.getByRole("heading", { name: /transfer/i }).first().waitFor({ timeout: 15000 });
  await SHOT(page, "05-transfer");
  // 06 record
  await page.goto("/record");
  await page.getByRole("heading", { name: /catat/i }).first().waitFor({ timeout: 15000 });
  await SHOT(page, "06-record");
  // 07 activity
  await page.goto("/activity");
  await page.getByRole("heading", { name: "Aktivitas" }).waitFor({ timeout: 15000 });
  await SHOT(page, "07-activity");
  // 08 reports
  await page.goto("/reports");
  await page.getByRole("heading", { name: /laporan/i }).first().waitFor({ timeout: 15000 });
  await SHOT(page, "08-reports");
  // 09 sync (web: kelola perangkat)
  await page.goto("/sync");
  await page.getByRole("heading", { name: "Sinkron" }).waitFor({ timeout: 15000 });
  await SHOT(page, "09-sync");
  // 10 debug native-sync (mock pairing + kirim)
  await page.goto("/debug-sync");
  await page.getByRole("heading", { name: "Sinkron" }).waitFor({ timeout: 15000 });
  await page.getByLabel(/alamat server/i).fill("https://contoh.local:3000");
  await page.getByLabel(/kata sandi/i).fill("rahasia");
  await page.getByLabel(/nama perangkat/i).fill("HP Uji");
  await page.getByRole("button", { name: "Tautkan", exact: true }).click();
  await page.getByRole("heading", { name: "Kedua sisi punya data" }).waitFor({ timeout: 10000 });
  await SHOT(page, "10-sync-choice");
  // eslint-disable-next-line no-console
  console.log(`ERRORS=${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
});
