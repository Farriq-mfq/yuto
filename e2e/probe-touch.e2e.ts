import { chromium, expect, test } from "@playwright/test";

// Tap sentuh (bukan klik mouse) di halaman sync + navigasi tab.
test("touch: tap tab bekerja di emulasi mobile", async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto("http://localhost:5174/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("http://localhost:5174/", { timeout: 15000 });
  await page.goto("http://localhost:5174/sync");
  await page.getByRole("heading", { name: "Sinkron" }).waitFor({ timeout: 15000 });
  await page.touchscreen.tap(117, 800);
  await page.waitForURL("http://localhost:5174/wallet", { timeout: 10000 });
  // eslint-disable-next-line no-console
  console.log(`TOUCH_OK ERRORS=${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
  await browser.close();
});
