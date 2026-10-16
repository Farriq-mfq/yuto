import { expect, test } from "@playwright/test";

// Verifikasi visual+fungsional halaman debug native-sync (DEV-only).
test("debug-sync: pairing mock sampai kartu pilihan + tombol Batal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto("/debug-sync");
  await page.getByRole("heading", { name: "Sinkron" }).waitFor({ timeout: 15000 });
  await page.getByLabel(/alamat server/i).fill("https://contoh.local:3000");
  await page.getByLabel(/kata sandi/i).fill("rahasia");
  await page.getByLabel(/nama perangkat/i).fill("HP Uji");
  await page.getByRole("button", { name: "Tautkan", exact: true }).click();
  // kartu 3 pilihan muncul (mock needsChoice) + tombol Batal saat busy
  await page.getByRole("heading", { name: "Kedua sisi punya data" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: "./probe-debug-sync.png" });
  // Batal pada kartu pilihan (ada request mock 800ms yang bisa dibatalkan)
  await page.getByRole("button", { name: "Kirim data HP ini", exact: true }).click();
  await page.getByRole("button", { name: "Batal", exact: true }).first().click();
  await page.getByText("Dibatalkan.").waitFor({ timeout: 10000 });
  expect(errors, "error JS").toEqual([]);
});
