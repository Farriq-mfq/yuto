import { describe, expect, test } from "bun:test";
import {
  digitsOnly,
  formatPercent,
  formatRupiah,
  parsePositiveInt,
} from "./money";

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

describe("formatPercent", () => {
  test("formats Indonesian percent with one decimal", () => {
    expect(formatPercent(33.333)).toBe("33,3%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(100)).toBe("100,0%");
  });
});

describe("digitsOnly", () => {
  test("strips non-digits", () => {
    expect(digitsOnly("Rp 250.000")).toBe("250000");
    expect(digitsOnly("abc")).toBe("");
  });

  test("caps at 15 digits", () => {
    expect(digitsOnly("12345678901234567890")).toBe("123456789012345");
  });
});

describe("parsePositiveInt", () => {
  test("parses grouped input", () => {
    expect(parsePositiveInt("250.000")).toBe(250000);
  });

  test("empty or digitless input is zero", () => {
    expect(parsePositiveInt("")).toBe(0);
    expect(parsePositiveInt("Rp")).toBe(0);
  });
});
