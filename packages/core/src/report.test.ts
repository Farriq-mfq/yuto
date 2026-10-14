import { describe, expect, test } from "bun:test";
import { categoryPercent, changeVsPrevious } from "./report";

describe("categoryPercent", () => {
  test("shares the kind total by ratio", () => {
    expect(categoryPercent(70000, 100000)).toBe(70);
    expect(categoryPercent(30000, 100000)).toBe(30);
  });

  test("zero kind total yields zero instead of NaN", () => {
    expect(categoryPercent(0, 0)).toBe(0);
  });
});

describe("changeVsPrevious", () => {
  test("delta vs the previous month (up, down, flat)", () => {
    expect(changeVsPrevious(120000, 70000)).toBe(50000);
    expect(changeVsPrevious(10000, 30000)).toBe(-20000);
    expect(changeVsPrevious(15000, 15000)).toBe(0);
  });

  test("new category counts the full total as growth", () => {
    expect(changeVsPrevious(20000, 0)).toBe(20000);
  });
});
