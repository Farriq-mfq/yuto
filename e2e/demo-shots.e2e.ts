import { expect, test } from "@playwright/test";

// Screenshot README dengan data demo bersih (nama asli, bukan 2DEV).
// Membuat -> screenshot -> hapus lagi (bersih-bersih di finally).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SHOT = async (
  page: import("@playwright/test").Page,
  name: string,
) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `./screenshots/${name}.png` });
};

test("demo: screenshot README + bersih-bersih", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  // Akun 1: BCA bank.
  await page.goto("/wallet/new");
  await page.getByLabel("Institusi").click();
  await page.getByRole("option", { name: "BCA", exact: true }).click();
  await page.getByLabel("Nama kustom").fill("BCA Tabungan");
  await page.getByLabel("Kategori akun").fill("Tabungan");
  await page.getByLabel("Saldo awal").fill("5000000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);

  // Akun 2: GoPay (tab E-wallet dulu).
  await page.goto("/wallet/new");
  await page.getByRole("tab", { name: "E-wallet", exact: true }).click();
  await page.getByLabel("Institusi").click();
  await page.getByRole("option", { name: "GoPay", exact: true }).click();
  await page.getByLabel("Nama kustom").fill("GoPay");
  await page.getByLabel("Kategori akun").fill("E-wallet");
  await page.getByLabel("Saldo awal").fill("500000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);
  await SHOT(page, "demo-dompet");

  // Transaksi: Kopi keluar + Gaji masuk.
  for (const tx of [
    { kind: "Keluar", cat: "Makanan & Minuman", title: "Kopi Susu", amount: "25000" },
    { kind: "Masuk", cat: "Gaji", title: "Gaji Bulanan", amount: "2500000" },
  ]) {
    await page.goto("/record");
    await page.getByRole("tab", { name: tx.kind, exact: true }).click();
    await page.getByLabel("Akun", { exact: true }).click();
    await page.getByRole("option", { name: "BCA Tabungan" }).first().click();
    await page.getByLabel("Kategori").click();
    await page.getByRole("option", { name: tx.cat }).click();
    await page.getByLabel("Nominal").fill(tx.amount);
    await page.getByLabel("Judul").fill(tx.title);
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  await SHOT(page, "demo-beranda");
  await page.goto("/reports");
  await page.getByRole("heading", { name: /laporan/i }).first().waitFor({ timeout: 15000 });
  await SHOT(page, "demo-laporan");
  await page.goto("/activity");
  await page.getByRole("heading", { name: "Aktivitas" }).waitFor({ timeout: 15000 });
  await SHOT(page, "demo-aktivitas");

  // Bersih-bersih: hapus 2 transaksi + 2 akun (urutan aman: tx dulu).
  for (const title of ["Kopi Susu", "Gaji Bulanan"]) {
    await page.goto("/");
    await page.getByRole("link", { name: new RegExp(title) }).first().click();
    await page.getByRole("button", { name: "Hapus", exact: true }).click();
    await page.getByRole("button", { name: "Ya, hapus", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  for (const name of ["BCA Tabungan", "GoPay"]) {
    await page.goto("/wallet");
    await page.getByRole("link", { name: new RegExp(name) }).first().click();
    await page.getByRole("button", { name: "Hapus", exact: true }).click();
    await page.getByRole("button", { name: "Ya, hapus", exact: true }).click();
    await expect(page).toHaveURL(/\/wallet$/);
  }
});
