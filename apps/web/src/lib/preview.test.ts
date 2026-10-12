import { describe, expect, test } from "bun:test";
import { balanceBeforeTx, previewBalance } from "./preview";

describe("previewBalance", () => {
  test("expense mengurangi saldo", () => {
    expect(
      previewBalance({ currentBalance: 1_000_000, kind: "expense", amount: 250_000 }),
    ).toEqual({ before: 1_000_000, after: 750_000 });
  });

  test("income menambah saldo", () => {
    expect(
      previewBalance({ currentBalance: 1_000_000, kind: "income", amount: 250_000 }),
    ).toEqual({ before: 1_000_000, after: 1_250_000 });
  });

  test("saldo boleh minus (tidak dijaga di pratinjau)", () => {
    expect(
      previewBalance({ currentBalance: 50_000, kind: "expense", amount: 100_000 }),
    ).toEqual({ before: 50_000, after: -50_000 });
  });

  test("membulatkan pecahan ke rupiah utuh", () => {
    expect(
      previewBalance({ currentBalance: 1000.4, kind: "expense", amount: 0.6 }),
    ).toEqual({ before: 1000, after: 999 });
    const result = previewBalance({
      currentBalance: 1000,
      kind: "income",
      amount: 10.5,
    });
    expect(Number.isInteger(result.after)).toBe(true);
  });
});

describe("balanceBeforeTx", () => {
  test("mengeluarkan efek expense (saldo sebelum lebih besar)", () => {
    expect(
      balanceBeforeTx({
        currentBalance: 750_000,
        txKind: "expense",
        txAmount: 250_000,
      }),
    ).toBe(1_000_000);
  });

  test("mengeluarkan efek income (saldo sebelum lebih kecil)", () => {
    expect(
      balanceBeforeTx({
        currentBalance: 1_250_000,
        txKind: "income",
        txAmount: 250_000,
      }),
    ).toBe(1_000_000);
  });

  test("invers dari previewBalance (bolak-balik kembali ke awal)", () => {
    const start = 2_500_000;
    for (const kind of ["expense", "income"] as const) {
      const { after } = previewBalance({
        currentBalance: start,
        kind,
        amount: 123_456,
      });
      expect(
        balanceBeforeTx({ currentBalance: after, txKind: kind, txAmount: 123_456 }),
      ).toBe(start);
    }
  });
});
