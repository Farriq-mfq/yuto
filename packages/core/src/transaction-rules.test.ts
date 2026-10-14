import { describe, expect, test } from "bun:test";
import {
  itemsSumMatches,
  itemsTotal,
  kindMatchesCategory,
} from "./transaction-rules";

describe("itemsTotal", () => {
  test("sums quantity times unit price", () => {
    expect(
      itemsTotal([
        { quantity: 2, unitPrice: 10000 },
        { quantity: 1, unitPrice: 5000 },
      ]),
    ).toBe(25000);
  });

  test("empty list totals zero", () => {
    expect(itemsTotal([])).toBe(0);
  });
});

describe("itemsSumMatches", () => {
  test("matching breakdown passes", () => {
    expect(
      itemsSumMatches([{ quantity: 2, unitPrice: 10000 }], 20000),
    ).toBe(true);
  });

  test("mismatching breakdown fails", () => {
    expect(
      itemsSumMatches([{ quantity: 2, unitPrice: 10000 }], 15000),
    ).toBe(false);
  });

  test("missing or empty items mean no breakdown and pass", () => {
    expect(itemsSumMatches(undefined, 20000)).toBe(true);
    expect(itemsSumMatches([], 20000)).toBe(true);
  });
});

describe("kindMatchesCategory", () => {
  test("same kind passes", () => {
    expect(kindMatchesCategory("expense", "expense")).toBe(true);
  });

  test("different kind fails", () => {
    expect(kindMatchesCategory("income", "expense")).toBe(false);
  });
});
