import { describe, expect, test } from "bun:test";
import {
  combineLocalDateTime,
  currentMonthJakarta,
  dayKeyJakarta,
  firstDateOfMonthKey,
  formatLocalDateId,
  formatMonthId,
  formatRupiah,
  formatTimeJakarta,
  localDateFromDatePart,
  monthKeyFromDate,
  splitLocalDateTime,
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

describe("splitLocalDateTime", () => {
  test("splits date and time parts", () => {
    expect(splitLocalDateTime("2026-10-12T01:30")).toEqual({
      date: "2026-10-12",
      time: "01:30",
    });
  });

  test("missing separator keeps the whole value as date", () => {
    expect(splitLocalDateTime("")).toEqual({ date: "", time: "" });
  });
});

describe("formatLocalDateId", () => {
  test("formats a date part without timezone conversion", () => {
    expect(formatLocalDateId("2026-10-12")).toBe("12 Okt 2026");
    expect(formatLocalDateId("2026-05-01")).toBe("1 Mei 2026");
  });

  test("rejects malformed parts", () => {
    expect(formatLocalDateId("")).toBeNull();
    expect(formatLocalDateId("2026-13-01")).toBeNull();
    expect(formatLocalDateId("2026-10-12T01:30")).toBeNull();
  });
});

describe("formatMonthId", () => {
  test("formats a month key without timezone conversion", () => {
    expect(formatMonthId("2026-10")).toBe("Oktober 2026");
    expect(formatMonthId("2026-01")).toBe("Januari 2026");
  });

  test("rejects malformed keys", () => {
    expect(formatMonthId("")).toBeNull();
    expect(formatMonthId("2026-13")).toBeNull();
    expect(formatMonthId("2026-10-12")).toBeNull();
  });
});

describe("localDateFromDatePart", () => {
  test("parses to the same local calendar day", () => {
    const date = localDateFromDatePart("2026-10-12");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(12);
  });

  test("rejects impossible dates instead of rolling over", () => {
    expect(localDateFromDatePart("2026-02-30")).toBeUndefined();
    expect(localDateFromDatePart("")).toBeUndefined();
  });
});

describe("monthKeyFromDate", () => {
  test("reads the local calendar month", () => {
    expect(monthKeyFromDate(new Date(2026, 9, 1))).toBe("2026-10");
  });
});

describe("combineLocalDateTime", () => {
  test("round-trips the existing helper format exactly", () => {
    const original = "2026-10-12T01:30";
    const { date, time } = splitLocalDateTime(original);
    const picked = localDateFromDatePart(date);
    expect(picked).toBeDefined();
    expect(combineLocalDateTime(picked as Date, time)).toBe(original);
  });
});

describe("firstDateOfMonthKey", () => {
  test("returns the first day of the month", () => {
    const date = firstDateOfMonthKey("2026-10");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(1);
  });

  test("rejects malformed keys", () => {
    expect(firstDateOfMonthKey("")).toBeUndefined();
    expect(firstDateOfMonthKey("2026-13")).toBeUndefined();
  });
});
