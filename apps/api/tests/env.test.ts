import { describe, expect, test } from "bun:test";
import {
  EXAMPLE_JWT_SECRET,
  EXAMPLE_YUTO_PASSWORD,
  loadEnv,
} from "../src/lib/env";

const valid = {
  JWT_SECRET: "a".repeat(32),
  YUTO_PASSWORD: "b".repeat(12),
};

describe("loadEnv refuses weak secrets", () => {
  test("accepts strong secrets with sane defaults", () => {
    const env = loadEnv({ ...valid, NODE_ENV: "development" });
    expect(env.jwtSecret).toBe("a".repeat(32));
    expect(env.port).toBe(3000);
    expect(env.cookieSecure).toBe(false);
    expect(env.mapEnabled).toBe(true);
  });

  test("cookie is secure by default in production", () => {
    const env = loadEnv({ ...valid, NODE_ENV: "production" });
    expect(env.cookieSecure).toBe(true);
  });

  test("rejects JWT_SECRET shorter than 32 chars", () => {
    expect(() =>
      loadEnv({ ...valid, JWT_SECRET: "too-short" }),
    ).toThrow();
  });

  test("rejects the example JWT_SECRET value", () => {
    expect(() =>
      loadEnv({ ...valid, JWT_SECRET: EXAMPLE_JWT_SECRET }),
    ).toThrow();
  });

  test("rejects YUTO_PASSWORD shorter than 12 chars", () => {
    expect(() =>
      loadEnv({ ...valid, YUTO_PASSWORD: "short" }),
    ).toThrow();
  });

  test("rejects the example YUTO_PASSWORD value", () => {
    expect(() =>
      loadEnv({ ...valid, YUTO_PASSWORD: EXAMPLE_YUTO_PASSWORD }),
    ).toThrow();
  });

  test("rejects an invalid PORT", () => {
    expect(() => loadEnv({ ...valid, PORT: "abc" })).toThrow();
  });
});
