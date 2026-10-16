import { expect, test } from "@playwright/test";

// Verifikasi visual SEMENTARA: header sticky menempel saat scroll.
test("sticky header menempel saat scroll", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  const stuck = await page.evaluate(() => {
    window.scrollTo(0, 2000);
    const bar = document.querySelector(
      "#konten-utama > div:first-child",
    ) as HTMLElement | null;
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      pos: getComputedStyle(bar).position,
      scrolled: Math.round(window.scrollY),
    };
  });
  // eslint-disable-next-line no-console
  console.log(`STUCK=${JSON.stringify(stuck)}`);
  await page.screenshot({ path: "./probe-sticky.png" });
  expect(stuck).not.toBeNull();
  expect(stuck!.pos).toBe("sticky");
  expect(stuck!.scrolled).toBeGreaterThan(300);
  expect(stuck!.top).toBeLessThanOrEqual(8);
});
