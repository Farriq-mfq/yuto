import { describe, expect, test } from "bun:test";
import { newUuid } from "./uuid";

describe("newUuid", () => {
  test("bentuk UUID v4 RFC 4122", () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("unik tiap panggilan (tanpa crypto.randomUUID)", () => {
    const seen = new Set(Array.from({ length: 100 }, () => newUuid()));
    expect(seen.size).toBe(100);
  });
});
