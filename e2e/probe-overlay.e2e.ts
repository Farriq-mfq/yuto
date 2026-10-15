import { expect, test } from "@playwright/test";

// Audit diagnostik: elemen apa yang menerima tap di posisi tab bar?
// Bila elementFromPoint mengembalikan SELAIN link tab -> overlay penangkap sentuh.
test("audit: tidak ada overlay di atas tab bar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto("/login");
  await page.getByLabel(/kata sandi/i).fill("e2e-test-owner-pass");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("/", { timeout: 15000 });

  const hit = await page.evaluate(() => {
    const nav = document.querySelector("nav");
    if (!nav) return { error: "nav tidak ketemu" };
    const r = nav.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const anchor = el?.closest?.("a") as HTMLAnchorElement | null;
    const chain: string[] = [];
    let cur: Element | null = el;
    while (cur && chain.length < 6) {
      const pe = getComputedStyle(cur).pointerEvents;
      chain.push(`${cur.tagName.toLowerCase()}${cur.id ? "#" + cur.id : ""}(pe=${pe})`);
      cur = cur.parentElement;
    }
    return {
      tag: el?.tagName,
      text: (el?.textContent || "").trim().slice(0, 20),
      href: anchor?.getAttribute?.("href") ?? null,
      chain,
      vp: { w: window.innerWidth, h: window.innerHeight },
      navRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
  // eslint-disable-next-line no-console
  console.log(`HIT=${JSON.stringify(hit)} ERRORS=${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
  // why: titik tengah tab bar = tombol Catat (/record); yang penting
  // elementFromPoint jatuh TEPAT di rantai link (bukan overlay penangkap).
  expect(hit.href).toBe("/record");
});
