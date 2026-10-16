import { expect, test } from "@playwright/test";

// Verifikasi visual: hero Net + toggle sembunyi-saldo di Beranda.
test("beranda: hero net dan mask saldo", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  // hero = Net bulan ini duluan, lalu Total saldo (demoted, text-xl)
  await page.getByText("Net bulan ini").waitFor({ timeout: 15000 });
  const order = await page.evaluate(() => {
    const main = document.querySelector("main");
    const text = main?.textContent ?? "";
    const cards = [...(main?.querySelectorAll("[aria-label]") ?? [])].map((e) =>
      e.getAttribute("aria-label"),
    );
    return {
      netFirst: text.indexOf("Net bulan ini") < text.indexOf("Total saldo"),
      cards,
    };
  });
  // eslint-disable-next-line no-console
  console.log(`ORDER=${JSON.stringify(order)}`);
  await page.getByRole("button", { name: /sembunyikan saldo/i }).click();
  await page.getByText("Rp ••••").first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: "./probe-home-hidden.png" });
  expect(order.netFirst).toBe(true);
});
