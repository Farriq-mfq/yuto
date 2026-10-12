import { describe, expect, test } from "bun:test";
import {
  currentMonthJakarta,
  dayKeyJakarta,
  formatRupiah,
  formatTimeJakarta,
  toDateTimeLocalJakarta,
} from "./format";

describe("formatRupiah", () => {
  test("formats whole rupiah in id-ID style", () => {
    expect(formatRupiah(250000)).toBe("Rp 250.000");
  });

  test("formats zero", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  test("rounds fractional input to whole rupiah", () => {
    expect(formatRupiah(1500.6)).toBe("Rp 1.501");
  });
});

describe("currentMonthJakarta", () => {
  test("returns YYYY-MM in Asia/Jakarta", () => {
    // 2026-01-31 18:00 UTC is 2026-02-01 01:00 in Jakarta.
    expect(currentMonthJakarta(new Date("2026-01-31T18:00:00Z"))).toBe(
      "2026-02",
    );
  });
});

describe("dayKeyJakarta", () => {
  test("groups by Jakarta calendar day across the UTC boundary", () => {
    // 2026-10-11 18:30 UTC is 2026-10-12 01:30 in Jakarta.
    expect(dayKeyJakarta("2026-10-11T18:30:00Z")).toBe("2026-10-12");
    expect(dayKeyJakarta("2026-10-11T16:30:00Z")).toBe("2026-10-11");
  });
});

describe("formatTimeJakarta", () => {
  test("shows HH:mm in Asia/Jakarta", () => {
    expect(formatTimeJakarta("2026-10-11T18:30:00Z")).toBe("01.30");
  });
});

describe("toDateTimeLocalJakarta", () => {
  test("converts an instant to Jakarta wall time", () => {
    expect(toDateTimeLocalJakarta("2026-10-11T18:30:00Z")).toBe(
      "2026-10-12T01:30",
    );
  });
});
