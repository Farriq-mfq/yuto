import { expect, test } from "@playwright/test";

// Audit diagnostik: elementFromPoint di atas field URL + tombol Tautkan
// pada /debug-sync (NativeSyncView yang sama dengan native).
test("audit: tidak ada overlay di halaman sync", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto("/debug-sync");
  await page.getByRole("heading", { name: "Sinkron" }).waitFor({ timeout: 15000 });

  const hit = await page.evaluate(() => {
    const probe = async (selector: string) => {
      const target = document.querySelector(selector) as HTMLElement | null;
      if (!target) return { selector, found: false as const };
      const r = target.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const chain: string[] = [];
      let cur: Element | null = el;
      while (cur && chain.length < 5) {
        chain.push(
          `${cur.tagName.toLowerCase()}${cur.id ? "#" + cur.id : ""}(pe=${getComputedStyle(cur).pointerEvents})`,
        );
        cur = cur.parentElement;
      }
      return { selector, found: true as const, hitTag: el?.tagName, chain };
    };
    return (async () => [
      await probe("#sync-server-url"),
      await probe('button[type="submit"]'),
    ])();
  });
  // eslint-disable-next-line no-console
  console.log(`HIT2=${JSON.stringify(hit)} ERRORS=${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
  for (const h of hit) {
    expect(h.found, `${h.selector} harus ada`).toBe(true);
  }
});
