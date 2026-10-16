import { expect, test } from "@playwright/test";

// Sembunyi per akun: buat akun -> toggle di halaman edit -> daftar
// menampilkan Rp •••• untuk akun itu -> hapus akun (bersih-bersih).
test("sembunyi per akun bertahan di daftar dompet", async ({ page }) => {
  const TAG = `E2E Hide ${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/wallet/new");
  await page.getByLabel("Institusi").click();
  await page.getByRole("option", { name: "Lainnya…", exact: true }).click();
  await page.getByLabel("Nama institusi lain").fill(`${TAG} Inst`);
  await page.getByLabel("Nama kustom").fill(TAG);
  await page.getByLabel("Kategori akun").fill(`${TAG} Cat`);
  await page.getByLabel("Saldo awal").fill("123456");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);

  // Buka edit akun itu (link kartu ber-aria-label nama + saldo).
  await page.getByRole("link", { name: new RegExp(TAG) }).first().click();
  await expect(page).toHaveURL(/\/wallet\/.+/);
  // Nyalakan sembunyi akun ini.
  await page.getByRole("switch", { name: "Sembunyikan akun ini" }).click();
  await page.goto("/wallet");
  const card = page.getByRole("link", { name: new RegExp(TAG) }).first();
  await expect(card).toContainText("Rp ••••");

  // Bersih-bersih: buka lagi -> hapus via dialog.
  await card.click();
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("button", { name: "Ya, hapus", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet$/);
});
