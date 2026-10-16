import { expect, test } from "@playwright/test";

// Verifikasi visual: empty state Beranda memuat tombol CTA.
test("empty state beranda ada tombol catat", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel(/bulan/i).fill("2030-01");
  await page
    .getByRole("link", { name: "Catat transaksi" })
    .waitFor({ timeout: 15000 });
  await page.screenshot({ path: "./empty-state-cta.png", fullPage: true });
  await page.getByRole("link", { name: "Catat transaksi" }).click();
  await page.waitForURL("/record", { timeout: 10000 });
});
