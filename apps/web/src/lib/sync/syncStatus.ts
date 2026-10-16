import { useSyncExternalStore } from "react";
import type { KeyValue } from "./tokenStore";

// why: konstanta ini tinggal di sini (bukan di syncEngine) agar
// syncStatus tidak menarik seluruh engine (+ Eden treaty) ke chunk utama —
// gate mengimpor syncEngine secara DINAMIS dan build memperingatkan
// INEFFECTIVE_DYNAMIC_IMPORT bila rantai statis ikut menyeretnya.
export const SYNC_DEBOUNCE_MS = 3000;

// Status sync terakhir + penjadwal sync otomatis (Phase 11 part 3).
// lastSyncAt/lastError persisten di KV (localStorage di web); UI membaca
// via useSyncStatus() (useSyncExternalStore). Engine sendiri murni dan tak
// menyentuh store ini — pencatatan dilakukan pemanggil (hook/layar/gate).

export const SYNC_LAST_AT_KEY = "yuto.sync.lastSyncAt";
export const SYNC_LAST_ERROR_KEY = "yuto.sync.lastError";

export interface SyncStatusSnapshot {
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

type Listener = () => void;

interface StatusDeps {
  kv: KeyValue;
}

function browserKv(): KeyValue {
  const storage = window.localStorage;
  return {
    getItem: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        // Abaikan: status tak boleh menggagalkan sync.
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch {
        // Abaikan.
      }
    },
  };
}

/** Store status; satu instance modul untuk app, instance baru untuk test. */
export function createSyncStatus(deps?: StatusDeps) {
  const kv = deps?.kv ?? (typeof window !== "undefined" ? browserKv() : null);
  let syncing = false;
  let lastSyncAt: string | null = null;
  let lastError: string | null = null;
  try {
    lastSyncAt = kv?.getItem(SYNC_LAST_AT_KEY) ?? null;
    lastError = kv?.getItem(SYNC_LAST_ERROR_KEY) ?? null;
  } catch {
    // Abaikan: mulai dari kosong.
  }
  const listeners = new Set<Listener>();

  // why: snapshot WAJIB stabil (referensi sama selama nilainya sama) —
  // useSyncExternalStore membandingkan dengan Object.is; objek baru di
  // tiap getSnapshot memicu re-render tanpa henti (React error #185,
  // halaman Sync blank di native).
  let cached: SyncStatusSnapshot = { syncing, lastSyncAt, lastError };

  function snapshot(): SyncStatusSnapshot {
    if (
      cached.syncing !== syncing ||
      cached.lastSyncAt !== lastSyncAt ||
      cached.lastError !== lastError
    ) {
      cached = { syncing, lastSyncAt, lastError };
    }
    return cached;
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: snapshot,
    setSyncing(value: boolean): void {
      if (syncing === value) return;
      syncing = value;
      emit();
    },
    recordSuccess(at: Date = new Date()): void {
      lastSyncAt = at.toISOString();
      lastError = null;
      try {
        kv?.setItem(SYNC_LAST_AT_KEY, lastSyncAt);
        kv?.removeItem(SYNC_LAST_ERROR_KEY);
      } catch {
        // Abaikan.
      }
      emit();
    },
    recordError(message: string): void {
      lastError = message;
      try {
        kv?.setItem(SYNC_LAST_ERROR_KEY, message);
      } catch {
        // Abaikan.
      }
      emit();
    },
    clearError(): void {
      lastError = null;
      try {
        kv?.removeItem(SYNC_LAST_ERROR_KEY);
      } catch {
        // Abaikan.
      }
      emit();
    },
  };
}

export type SyncStatusStore = ReturnType<typeof createSyncStatus>;

/** Singleton aplikasi (hook + gate + penjadwal berbagi yang ini). */
export const syncStatus = createSyncStatus();

/** Baca status sync di komponen. */
export function useSyncStatus(
  store: SyncStatusStore = syncStatus,
): SyncStatusSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

type SyncRunner = () => Promise<void>;

let runner: SyncRunner | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Didaftarkan sekali oleh gate native (runner = syncNow + catat status). */
export function initSyncRunner(run: SyncRunner | null): void {
  runner = run;
}

/**
 * Jadwalkan sync pasca-tulis (debounce). `delayMs` hanya untuk test;
 * produksi memakai SYNC_DEBOUNCE_MS.
 */
export function scheduleSyncAfterWrite(
  delayMs: number = SYNC_DEBOUNCE_MS,
): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runner?.();
  }, delayMs);
}

/** Batalkan jadwal tertunda (mis. saat unmount gate). */
export function cancelScheduledSync(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

export async function runSyncGuarded<T>(
  run: () => Promise<T>,
): Promise<T | null> {
  if (syncStatus.getSnapshot().syncing) return null;
  syncStatus.setSyncing(true);
  try {
    const result = await run();
    syncStatus.recordSuccess();
    return result;
  } catch (error) {
    syncStatus.recordError(
      error instanceof Error ? error.message : "Sinkronisasi gagal",
    );
    return null;
  } finally {
    syncStatus.setSyncing(false);
  }
}
