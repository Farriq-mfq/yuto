import { describe, expect, test } from "bun:test";
import { normalizeServerUrl } from "./serverUrl";

describe("normalizeServerUrl", () => {
  test("menerima https:// ke host apa pun", () => {
    expect(normalizeServerUrl("https://192.168.1.10:3000")).toBe(
      "https://192.168.1.10:3000",
    );
    expect(normalizeServerUrl("https://yuto-rumah.example.com")).toBe(
      "https://yuto-rumah.example.com",
    );
  });

  test("menerima http:// loopback + memangkas trailing slash", () => {
    expect(normalizeServerUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeServerUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(normalizeServerUrl("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  test("menolak http:// ke IP LAN (token bearer tak boleh cleartext)", () => {
    expect(() => normalizeServerUrl("http://192.168.1.10:3000")).toThrow();
  });

  test("menolak http:// ke hostname LAN/mDNS", () => {
    expect(() => normalizeServerUrl("http://yuto-server.local:3000")).toThrow();
    expect(() => normalizeServerUrl("http://nas:3000")).toThrow();
  });

  test("menolak skema non-http, userinfo, path /api, dan sampah", () => {
    expect(() => normalizeServerUrl("ftp://192.168.1.10/x")).toThrow();
    expect(() => normalizeServerUrl("https://user@host:3000")).toThrow();
    expect(() => normalizeServerUrl("https://host:3000/api")).toThrow();
    expect(() => normalizeServerUrl("bukan-url")).toThrow();
    expect(() => normalizeServerUrl("")).toThrow();
  });
});
