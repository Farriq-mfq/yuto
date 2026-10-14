import { describe, expect, test } from "bun:test";
import {
  JakartaTimeError,
  jakartaDayRange,
  jakartaMonthRange,
  previousMonth,
} from "./jakarta-time";

describe("jakartaMonthRange", () => {
  test("month range converts WIB boundaries to UTC", () => {
    const { start, end } = jakartaMonthRange("2026-01");
    expect(start.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-31T17:00:00.000Z");
  });

  test("december month rolls over to january", () => {
    const { start, end } = jakartaMonthRange("2026-12");
    expect(start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  test("bad month formats throw invalid-month", () => {
    for (const bad of ["2026-13", "2026-1", "januari", "2026/01", ""]) {
      try {
        jakartaMonthRange(bad);
        throw new Error(`expected ${bad} to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(JakartaTimeError);
        expect((err as JakartaTimeError).failure).toBe("invalid-month");
      }
    }
  });
});

describe("jakartaDayRange", () => {
  test("day range is 24 hours from WIB midnight", () => {
    const { start, end } = jakartaDayRange("2026-02-01");
    expect(start.toISOString()).toBe("2026-01-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T17:00:00.000Z");
  });

  test("impossible dates throw invalid-date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "bukan-tanggal", ""]) {
      try {
        jakartaDayRange(bad);
        throw new Error(`expected ${bad} to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(JakartaTimeError);
        expect((err as JakartaTimeError).failure).toBe("invalid-date");
      }
    }
  });
});

describe("previousMonth", () => {
  test("steps back one month", () => {
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  test("january rolls back to december of the previous year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  test("bad month formats throw invalid-month", () => {
    try {
      previousMonth("2026-13");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(JakartaTimeError);
      expect((err as JakartaTimeError).failure).toBe("invalid-month");
    }
  });
});
