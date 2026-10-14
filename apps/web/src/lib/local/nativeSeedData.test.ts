import { describe, expect, test } from "bun:test";
// why: import root @yuto/local AMAN di bun (bun:sqlite tersedia); di bundle
// WebView modul ini tak pernah dibundel (test-only), jadi paritas data
// seed native vs kanonis bisa dicek di sini.
import { defaultCategories } from "@yuto/local";
import { NATIVE_SEED_CATEGORIES } from "./nativeSeedData";

describe("native seed parity", () => {
  test("13 kategori default sama persis dengan @yuto/local", () => {
    expect([...NATIVE_SEED_CATEGORIES]).toEqual([...defaultCategories]);
  });
});
