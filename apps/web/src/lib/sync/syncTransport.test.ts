import { describe, expect, test } from "bun:test";
import { HttpSyncTransport, SyncError } from "./syncTransport";
import { strings } from "../../strings";

// why: regresi "UI stuck saat request ke API" — server yang diam (IP tak
// terjangkau / firewall drop) membuat fetch menggantung sementara layar
// terkunci `busy`. Transport WAJIB menggagalkan request tepat waktu.
// 10.255.255.1 tak ter-route di mana pun → connect menggantung sampai
// timeout (tanpa jaringan pun abort tetap menembak).

describe("HttpSyncTransport timeout", () => {
  test("pair ke host diam gagal cepat dengan pesan unreachable", async () => {
    const transport = new HttpSyncTransport(300);
    const t0 = Date.now();
    try {
      await transport.pair("http://10.255.255.1:9", "pw", "HP");
      expect.unreachable("pair harus melempar");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).message).toBe(
        strings.syncServerUnreachable,
      );
    }
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  test("pull ke host diam gagal cepat dengan pesan unreachable", async () => {
    const transport = new HttpSyncTransport(300);
    try {
      await transport.pull("http://10.255.255.1:9", "tok", 0, 10);
      expect.unreachable("pull harus melempar");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).message).toBe(
        strings.syncServerUnreachable,
      );
    }
  });
});

describe("pembatalan manual (tombol Batal)", () => {
  test("pair yang dibatalkan user melempar pesan Dibatalkan", async () => {
    const transport = new HttpSyncTransport(10_000);
    const controller = new AbortController();
    const pending = transport.pair(
      "http://10.255.255.1:9",
      "pw",
      "HP",
      controller.signal,
    );
    controller.abort();
    try {
      await pending;
      expect.unreachable("pair harus melempar");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).message).toBe(strings.syncCancelled);
    }
  });

  test("signal yang sudah aborted menolak langsung tanpa request", async () => {
    const transport = new HttpSyncTransport(10_000);
    const controller = new AbortController();
    controller.abort();
    const t0 = Date.now();
    try {
      await transport.pull("http://10.255.255.1:9", "tok", 0, 10, controller.signal);
      expect.unreachable("pull harus melempar");
    } catch (error) {
      expect((error as SyncError).message).toBe(strings.syncCancelled);
    }
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});
