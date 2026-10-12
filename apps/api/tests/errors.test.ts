import { describe, expect, test } from "bun:test";
import { errorResponse } from "../src/lib/errors";

describe("error format", () => {
  test("matches { error: { code, message } }", () => {
    expect(errorResponse("UNAUTHORIZED", "Login diperlukan.")).toEqual({
      error: { code: "UNAUTHORIZED", message: "Login diperlukan." },
    });
  });
});
