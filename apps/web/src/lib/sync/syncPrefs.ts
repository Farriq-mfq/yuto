import { normalizeServerUrl } from "./serverUrl";
import type { KeyValue } from "./tokenStore";

// Preferensi mode sinkronisasi (toggle "Sinkronisasi" di layar /sync).
//
// Aturan: default MATI (false) — sinkron hanya berjalan atas opt-in
// eksplisit. Pairing sukses menyalakannya (ditulis lapisan UI, BUKAN
// engine); batal/lepas tautan mematikannya lagi. `canSync` murni
// (tanpa IO) agar mudah dites; pembacaan pref + status online dilakukan
// di call-site (layar Sync, guard AutoSyncDataSource).

export const SYNC_ENABLED_KEY = "yuto-sync-enabled";

function prefsKv(): KeyValue {
  if (typeof window !== "undefined" && window.localStorage) {
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
          // Abaikan: pref kembali mati saat dibaca ulang.
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key);
        } catch {
          // Abaikan: lihat setItem.
        }
      },
    };
  }
  // why: runtime non-DOM (test bun) — tidak persisten, hanya agar modul
  // bisa diimpor; test memakai fake sendiri.
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    },
  };
}

/** Baca pref; `kv` hanya untuk test. Default: MATI. */
export async function loadSyncEnabled(
  kv: KeyValue = prefsKv(),
): Promise<boolean> {
  try {
    return kv.getItem(SYNC_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Tulis pref (`true` = "1", `false` = hapus kunci); `kv` hanya untuk test. */
export async function saveSyncEnabled(
  value: boolean,
  kv: KeyValue = prefsKv(),
): Promise<void> {
  try {
    if (value) kv.setItem(SYNC_ENABLED_KEY, "1");
    else kv.removeItem(SYNC_ENABLED_KEY);
  } catch {
    // Abaikan: lihat prefsKv.
  }
}

export interface CanSyncInput {
  enabled: boolean;
  serverUrl: string;
  online: boolean;
}

/**
 * Guard murni: sinkron boleh jalan bila pref menyala DAN URL server lolos
 * validasi `normalizeServerUrl` (https / http-loopback) DAN sedang online.
 */
export function canSync({ enabled, serverUrl, online }: CanSyncInput): boolean {
  if (!enabled || !online) return false;
  try {
    normalizeServerUrl(serverUrl);
  } catch {
    return false;
  }
  return true;
}
