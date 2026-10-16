import { treaty } from "@elysiajs/eden";
import type { App } from "../../../../api/src/app";
import type {
  PairResult,
  PullResult,
  PushResult,
} from "../../../../api/src/modules/sync/service";
import { strings } from "../../strings";

// Transport protokol sync (Phase 11 part 3): antarmuka injectable agar
// engine murni bisa diuji dengan fake in-memory (tanpa server, tanpa mock
// fetch global). Implementasi HTTP di bawah memakai Eden Treaty ke URL
// server arbitrary (LAN), BUKAN instance `api` yang terkunci ke origin.

// Tipe hasil diambil dari service API (type-only, kontrak compile-time —
// build web pecah bila kontrak server berubah) — BUKAN duplikasi tipe.

/** Body push: bentuk persis yang divalidasi service push server. */
export interface PushPayload {
  accounts: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
}

export interface SyncTransport {
  pair(
    baseUrl: string,
    password: string,
    deviceName: string,
    signal?: AbortSignal,
  ): Promise<PairResult>;
  push(
    baseUrl: string,
    token: string,
    body: PushPayload,
    signal?: AbortSignal,
  ): Promise<PushResult>;
  pull(
    baseUrl: string,
    token: string,
    since: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PullResult>;
}

/** Error transport dengan status HTTP (undefined = jaringan/unexpected). */
export class SyncError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "SyncError";
    this.status = status;
    this.code = code;
  }
}

/** Pesan server dari body error Eden ({ error: { code, message } }). */
function readServerMessage(error: unknown): { message: string; code: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const value =
    "value" in error &&
    typeof (error as { value: unknown }).value === "object"
      ? ((error as { value: unknown }).value as Record<string, unknown>)
      : (error as Record<string, unknown>);
  if (value === null) return null;
  const inner = value.error;
  if (typeof inner !== "object" || inner === null) return null;
  const { code, message } = inner as { code?: unknown; message?: unknown };
  if (typeof message !== "string" || message.length === 0) return null;
  return {
    message,
    code: typeof code === "string" ? code : "UNKNOWN",
  };
}

/** Timeout/abort dari fetch (treaty me-resolve `{ status: 503, error: TimeoutError }`, bukan melempar). */
function isTimeout(error: unknown): boolean {
  const text = String(error);
  return (
    text.includes("TimeoutError") ||
    text.includes("aborted") ||
    text.includes("AbortError") ||
    text.includes("operation timed out")
  );
}

function toSyncError(error: unknown, status: number): SyncError {
  if (isTimeout(error)) return new SyncError(strings.syncServerUnreachable);
  const server = readServerMessage(error);
  if (server) return new SyncError(server.message, status, server.code);
  if (status === 401) return new SyncError(strings.syncUnauthorized, status);
  if (status === 429) return new SyncError(strings.syncRateLimited, status);
  return new SyncError(strings.syncFailed, status);
}

/** Transport HTTP via Eden Treaty (typed, tanpa tipe fetch tulisan tangan). */
export class HttpSyncTransport implements SyncTransport {
  /**
   * Batas tiap request (ms). Tanpa ini, server yang diam (IP tak terjangkau,
   * firewall drop, HP beda jaringan) membuat fetch menggantung bermenit-
   * menit sementara layar terkunci `busy` (semua tombol disabled) → UI
   * terlihat "stuck, tidak bisa digerakkan". Abort memaksa gagal cepat
   * menjadi SyncError(server unreachable).
   */
  constructor(private readonly timeoutMs: number = 20_000) {}

  private signal(external?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    if (!external) return timeout;
    // why: gabungan timeout internal + batal manual dari UI — mana yang
    // lebih dulu menembak, request gagal. AbortSignal.any tersedia di
    // WebView modern + bun/node 20+.
    return AbortSignal.any([timeout, external]);
  }

  /** Dibatalkan user via tombol Batal (bukan timeout/server mati). */
  private static throwIfCancelled(external?: AbortSignal): void {
    if (external?.aborted) {
      throw new SyncError(strings.syncCancelled);
    }
  }
  async pair(
    baseUrl: string,
    password: string,
    deviceName: string,
    signal?: AbortSignal,
  ): Promise<PairResult> {
    let res;
    try {
      res = await treaty<App>(baseUrl).api.sync.pair.post(
        {
          password,
          deviceName,
        },
        { fetch: { signal: this.signal(signal) } },
      );
    } catch {
      HttpSyncTransport.throwIfCancelled(signal);
      throw new SyncError(strings.syncServerUnreachable);
    }
    // why: treaty me-resolve (bukan melempar) saat abort/timeout — bila
    // user yang membatalkan, hasilnya tak bermakna; dahulukan pesan Batal.
    HttpSyncTransport.throwIfCancelled(signal);
    if (res.error) throw toSyncError(res.error, res.status);
    const data = res.data as { token?: unknown; deviceId?: unknown } | null;
    if (
      !data ||
      typeof data.token !== "string" ||
      typeof data.deviceId !== "string"
    ) {
      throw new SyncError(strings.syncUnexpectedResponse);
    }
    return { token: data.token, deviceId: data.deviceId };
  }

  async push(
    baseUrl: string,
    token: string,
    body: PushPayload,
    signal?: AbortSignal,
  ): Promise<PushResult> {
    let res;
    try {
      // why: treaty memetakan t.Any() ke File (dukungan upload) sehingga
      // tipe body tak menerima JSON biasa — cast aman: payload ini murni
      // objek JSON (tanpa File/Blob, dicek runtime `H(r)` → stringify) dan
      // server memvalidasi tiap baris sendiri (kontrak push: rejected, bukan
      // 400).
      res = await treaty<App>(baseUrl).api.sync.push.post(body as unknown as never, {
        headers: { authorization: `Bearer ${token}` },
        fetch: { signal: this.signal(signal) },
      });
    } catch {
      HttpSyncTransport.throwIfCancelled(signal);
      throw new SyncError(strings.syncServerUnreachable);
    }
    HttpSyncTransport.throwIfCancelled(signal);
    if (res.error) throw toSyncError(res.error, res.status);
    // why: runtime JSON bisa menyimpang dari tipe Eden (Date→string dsb);
    // engine yang menormalisasi — di sini cukup pastikan bentuk kasarnya ada.
    const data = res.data as Partial<PushResult> | null;
    if (
      !data ||
      typeof data.applied !== "object" ||
      data.applied === null ||
      !Array.isArray(data.rejected)
    ) {
      throw new SyncError(strings.syncUnexpectedResponse);
    }
    return data as PushResult;
  }

  async pull(
    baseUrl: string,
    token: string,
    since: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PullResult> {
    let res;
    try {
      res = await treaty<App>(baseUrl).api.sync.pull.get({
        query: { since: String(since), limit: String(limit) },
        headers: { authorization: `Bearer ${token}` },
        fetch: { signal: this.signal(signal) },
      });
    } catch {
      HttpSyncTransport.throwIfCancelled(signal);
      throw new SyncError(strings.syncServerUnreachable);
    }
    HttpSyncTransport.throwIfCancelled(signal);
    if (res.error) throw toSyncError(res.error, res.status);
    const data = res.data as Partial<PullResult> | null;
    if (
      !data ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.transactions) ||
      !Array.isArray(data.transfers) ||
      !Array.isArray(data.categories) ||
      typeof data.cursor !== "number"
    ) {
      throw new SyncError(strings.syncUnexpectedResponse);
    }
    return data as PullResult;
  }
}
