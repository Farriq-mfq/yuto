// Penyimpanan token perangkat + konfigurasi pairing (Phase 11 part 3).
//
// Keputusan token (diteliti 2026-10-14, didokumentasikan di sini):
// - Native (Capacitor): token di `@aparajita/capacitor-secure-storage`
//   v8.0.1 (Keychain iOS / Keystore+AES-GCM Android; author sama dengan
//   plugin biometric-auth yang sudah dipakai app ini). Import DINAMIS agar
//   bundle web tak tersentuh.
// - Web browser: token di localStorage. Server adalah LAN tepercaya milik
//   sendiri; tetap SARANKAN https (validasi URL menegakkannya di luar
//   loopback). Ini BUKAN klaim aman — known gap yang diterima.
// - Fallback: bila plugin gagal dimuat di native, token jatuh ke
//   localStorage + `console.warn` (JANGAN klaim aman).
//   // TODO: angkat fallback ini menjadi error keras setelah plugin
//   terbukti stabil di build Android/iOS (butuh uji perangkat).
// - Server URL + nama perangkat bukan rahasia: selalu localStorage.

/** Permukaan key-value minimal (localStorage-like), injectable untuk test. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SYNC_TOKEN_KEY = "yuto.sync.token";
export const SYNC_SERVER_URL_KEY = "yuto.sync.serverUrl";
export const SYNC_DEVICE_NAME_KEY = "yuto.sync.deviceName";

/** Token + konfigurasi pairing. Seluruh method async (plugin secure async). */
export interface TokenStore {
  loadToken(): Promise<string | null>;
  saveToken(token: string): Promise<void>;
  loadServerUrl(): Promise<string | null>;
  saveServerUrl(url: string): Promise<void>;
  loadDeviceName(): Promise<string | null>;
  saveDeviceName(name: string): Promise<void>;
  /** Hapus token + URL + nama (batal/lepas tautan). Data lokal tetap. */
  clearPairing(): Promise<void>;
}

function readKey(kv: KeyValue, key: string): string | null {
  try {
    return kv.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(kv: KeyValue, key: string, value: string): void {
  try {
    kv.setItem(key, value);
  } catch {
    // why: penyimpanan penuh/private-mode tak boleh menggagalkan alur —
    // pairing ulang akan meminta kredensial lagi.
  }
}

/** Implementasi localStorage penuh (dipakai web; fallback native). */
export class LocalTokenStore implements TokenStore {
  constructor(private readonly kv: KeyValue) {}

  async loadToken(): Promise<string | null> {
    return readKey(this.kv, SYNC_TOKEN_KEY);
  }

  async saveToken(token: string): Promise<void> {
    writeKey(this.kv, SYNC_TOKEN_KEY, token);
  }

  async loadServerUrl(): Promise<string | null> {
    return readKey(this.kv, SYNC_SERVER_URL_KEY);
  }

  async saveServerUrl(url: string): Promise<void> {
    writeKey(this.kv, SYNC_SERVER_URL_KEY, url);
  }

  async loadDeviceName(): Promise<string | null> {
    return readKey(this.kv, SYNC_DEVICE_NAME_KEY);
  }

  async saveDeviceName(name: string): Promise<void> {
    writeKey(this.kv, SYNC_DEVICE_NAME_KEY, name);
  }

  async clearPairing(): Promise<void> {
    for (const key of [SYNC_TOKEN_KEY, SYNC_SERVER_URL_KEY, SYNC_DEVICE_NAME_KEY]) {
      try {
        this.kv.removeItem(key);
      } catch {
        // Abaikan: lihat writeKey.
      }
    }
  }
}

/**
 * Token di secure storage (native), sisanya di KV biasa. Plugin diimpor
 * dinamis per panggilan agar kegagalan load jatuh ke KV dengan peringatan
 * (lihat keputusan token di atas — JANGAN klaim aman).
 */
export class SecureTokenStore extends LocalTokenStore {
  /** Diisi test untuk memalsukan plugin tanpa dynamic import. */
  static pluginLoader: (() => Promise<SecurePlugin>) | null = null;

  private async plugin(): Promise<SecurePlugin | null> {
    try {
      if (SecureTokenStore.pluginLoader) {
        return await SecureTokenStore.pluginLoader();
      }
      const mod = await import("@aparajita/capacitor-secure-storage");
      return mod.SecureStorage as unknown as SecurePlugin;
    } catch (error) {
      console.warn(`[yuto] secure storage unavailable, token in plain KV: ${String(error)}`);
      return null;
    }
  }

  override async loadToken(): Promise<string | null> {
    const plugin = await this.plugin();
    if (!plugin) return super.loadToken();
    try {
      return await plugin.getItem(SYNC_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  override async saveToken(token: string): Promise<void> {
    const plugin = await this.plugin();
    if (!plugin) {
      await super.saveToken(token);
      return;
    }
    await plugin.setItem(SYNC_TOKEN_KEY, token);
  }

  override async clearPairing(): Promise<void> {
    const plugin = await this.plugin();
    if (plugin) {
      try {
        await plugin.removeItem(SYNC_TOKEN_KEY);
      } catch {
        // Abaikan: lihat writeKey.
      }
    }
    await super.clearPairing();
  }
}

/** Permukaan plugin yang dipakai (subset string dari definitions upstream). */
export interface SecurePlugin {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function defaultKv(): KeyValue {
  if (typeof window !== "undefined" && window.localStorage) {
    const storage = window.localStorage;
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
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

/** Pabrik store: secure di native, localStorage di web. */
export function createTokenStore(options?: {
  native?: boolean;
  kv?: KeyValue;
}): TokenStore {
  const kv = options?.kv ?? defaultKv();
  if (options?.native === true) return new SecureTokenStore(kv);
  return new LocalTokenStore(kv);
}
