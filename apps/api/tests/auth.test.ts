import { beforeEach, describe, expect, test } from "bun:test";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-123456";
process.env.YUTO_PASSWORD = "test-owner-password";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://yuto:yuto@localhost:5432/yuto_test";

const { createApp } = await import("../src/app");
const { resetRateLimits } = await import("../src/lib/rate-limit");

function request(
  path: string,
  init?: RequestInit,
  ip = "9.9.9.9",
): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      ...(init?.headers ?? {}),
    },
  });
}

describe("auth", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  test("health check is public", async () => {
    const app = createApp();
    const res = await app.handle(request("/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("login succeeds and sets a session cookie", async () => {
    const app = createApp();
    const res = await app.handle(
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "test-owner-password" }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("yuto_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  test("wrong password returns 401 with the error format", async () => {
    const app = createApp();
    const res = await app.handle(
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong-password!!" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  test("login is rate limited with 429 after 5 failures", async () => {
    const app = createApp();
    const ip = "10.20.30.40";
    let res: Response | undefined;
    for (let i = 0; i < 6; i++) {
      res = await app.handle(
        request(
          "/api/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ password: "wrong-password!!" }),
          },
          ip,
        ),
      );
    }
    expect(res?.status).toBe(429);
  });

  test("guarded route without a cookie returns 401", async () => {
    const app = createApp();
    const res = await app.handle(request("/api/categories"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  test("guarded route with an invalid cookie returns 401", async () => {
    const app = createApp();
    const res = await app.handle(
      request("/api/categories", {
        headers: { cookie: "yuto_session=forged-token" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("logout clears the session cookie", async () => {
    const app = createApp();
    const login = await app.handle(
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "test-owner-password" }),
      }),
    );
    const session = login.headers.get("set-cookie") ?? "";
    const res = await app.handle(
      request("/api/auth/logout", {
        method: "POST",
        headers: { cookie: session.split(";")[0] ?? "" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("yuto_session=");
  });
});
