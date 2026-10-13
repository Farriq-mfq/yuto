import { describe, expect, test } from "bun:test";
import { previousMonth, weekDelta } from "./balanceStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-13T12:00:00+07:00").getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe("weekDelta", () => {
  test("naik: income − expense dalam 7 hari dijumlahkan positif", () => {
    const { delta } = weekDelta({
      totalNow: 1_000_000,
      transactions: [
        { kind: "income", amount: 200_000, occurredAt: iso(NOW - 2 * DAY_MS) },
        { kind: "expense", amount: 50_000, occurredAt: iso(NOW - DAY_MS) },
      ],
      nowMs: NOW,
    });
    expect(delta).toBe(150_000);
  });

  test("turun: expense dominan menghasilkan delta negatif", () => {
    const { delta } = weekDelta({
      totalNow: 800_000,
      transactions: [
        { kind: "expense", amount: 120_000, occurredAt: iso(NOW - 3 * DAY_MS) },
      ],
      nowMs: NOW,
    });
    expect(delta).toBe(-120_000);
  });

  test("flat: tanpa transaksi dalam jendela → delta 0", () => {
    const { delta } = weekDelta({
      totalNow: 500_000,
      transactions: [],
      nowMs: NOW,
    });
    expect(delta).toBe(0);
  });

  test("batas cutoff: tepat 7 hari lalu diabaikan, sesudahnya dihitung", () => {
    const { delta } = weekDelta({
      totalNow: 500_000,
      transactions: [
        // Tepat di cutoff (tidak > cutoff) → diabaikan.
        { kind: "income", amount: 999_000, occurredAt: iso(NOW - 7 * DAY_MS) },
        // Se-detik sesudah cutoff → dihitung.
        {
          kind: "income",
          amount: 10_000,
          occurredAt: iso(NOW - 7 * DAY_MS + 1_000),
        },
      ],
      nowMs: NOW,
    });
    expect(delta).toBe(10_000);
  });

  test("transaksi lama diabaikan walau nominal besar", () => {
    const { delta } = weekDelta({
      totalNow: 2_000_000,
      transactions: [
        {
          kind: "income",
          amount: 5_000_000,
          occurredAt: iso(NOW - 30 * DAY_MS),
        },
        { kind: "expense", amount: 50_000, occurredAt: iso(NOW - DAY_MS) },
      ],
      nowMs: NOW,
    });
    expect(delta).toBe(-50_000);
  });
});

describe("previousMonth", () => {
  test("bulan biasa mundur satu", () => {
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  test("Januari mundur ke Desember tahun sebelumnya", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
