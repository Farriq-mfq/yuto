import { afterAll, describe, expect, test } from "bun:test";
import { isHealthy } from "../src/healthcheck";

// Healthcheck kontainer: 200 = sehat, selain itu (atau tidak ada jawaban)
// harus dianggap gagal supaya Docker tahu API benar-benar siap.
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/health") return Response.json({ status: "ok" });
    return new Response("boom", { status: 503 });
  },
});

const base = `http://127.0.0.1:${server.port}`;

afterAll(() => server.stop(true));

describe("api healthcheck", () => {
  test("reports healthy when /api/health answers 200", async () => {
    expect(await isHealthy(`${base}/api/health`)).toBe(true);
  });

  test("reports unhealthy on a non-2xx answer", async () => {
    expect(await isHealthy(`${base}/other`)).toBe(false);
  });

  test("reports unhealthy when nothing is listening", async () => {
    expect(await isHealthy("http://127.0.0.1:1/api/health")).toBe(false);
  });
});
