import { describe, expect, test } from "bun:test";
import { APP_LOCK_TIMEOUT_MS, shouldRelock } from "./lockPolicy";

describe("lockPolicy", () => {
  test("timeout dua menit", () => {
    expect(APP_LOCK_TIMEOUT_MS).toBe(120_000);
  });

  test("kembali sebelum timeout tidak mengunci", () => {
    expect(shouldRelock(1_000, 1_000 + APP_LOCK_TIMEOUT_MS - 1)).toBe(false);
  });

  test("kembali tepat saat timeout mengunci", () => {
    expect(shouldRelock(1_000, 1_000 + APP_LOCK_TIMEOUT_MS)).toBe(true);
  });

  test("kembali setelah timeout mengunci", () => {
    expect(shouldRelock(0, 10 * 60 * 1000)).toBe(true);
  });

  test("tanpa catatan background mengunci (fail-closed)", () => {
    expect(shouldRelock(null, Date.now())).toBe(true);
  });
});
