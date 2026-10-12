import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearFailures,
  isLimited,
  recordFailure,
  resetRateLimits,
} from "../src/lib/rate-limit";

describe("login rate limit (5 failures/min/IP)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  test("allows 4 failures but blocks from the 5th", () => {
    for (let i = 0; i < 4; i++) recordFailure("1.2.3.4", 1000 + i);
    expect(isLimited("1.2.3.4", 2000)).toBe(false);
    recordFailure("1.2.3.4", 1500);
    expect(isLimited("1.2.3.4", 2000)).toBe(true);
  });

  test("blocks after 5 failures within a minute", () => {
    for (let i = 0; i < 6; i++) recordFailure("1.2.3.4", 1000 + i);
    expect(isLimited("1.2.3.4", 2000)).toBe(true);
  });

  test("limits one IP without affecting another", () => {
    for (let i = 0; i < 6; i++) recordFailure("1.2.3.4", 1000 + i);
    expect(isLimited("1.2.3.4", 2000)).toBe(true);
    expect(isLimited("5.6.7.8", 2000)).toBe(false);
  });

  test("failures older than a minute no longer count", () => {
    for (let i = 0; i < 5; i++) recordFailure("1.2.3.4", 0);
    expect(isLimited("1.2.3.4", 61_000)).toBe(false);
  });

  test("a successful login clears the failure count", () => {
    for (let i = 0; i < 5; i++) recordFailure("1.2.3.4", 1000 + i);
    clearFailures("1.2.3.4");
    expect(isLimited("1.2.3.4", 2000)).toBe(false);
  });
});
