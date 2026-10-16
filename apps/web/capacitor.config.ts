import type { CapacitorConfig } from '@capacitor/cli';

// Minimal Node typing (hindari @types/node), pola sama seperti vite.config.ts.
declare const process: { env: Record<string, string | undefined> };

// why TEST-ONLY: bila CAP_SERVER_URL di-set (mis. http://192.168.1.70:5173),
// aplikasi native memuat bundle langsung dari Vite dev di laptop (live
// reload, tanpa rebuild APK tiap ubah kode). WAJIB dikosongkan untuk
// build production/release — bundle prod selalu dari `dist` hasil build.
// Dipakai bersama `android:usesCleartextTraffic="true"` SEMENTARA di
// AndroidManifest (revert sebelum release).
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.farriq.yuto',
  appName: 'Yuto',
  webDir: 'dist',
  server: devServerUrl
    ? {
        url: devServerUrl,
        // why: dev server Vite = http polos di LAN; tanpa ini WebView
        // menolak cleartext (ERR_CLEARTEXT_NOT_PERMITTED).
        cleartext: true,
      }
    : undefined,
  plugins: {
    CapacitorSQLite: {
      // why: wajib true agar plugin membuka/mengenkripsi database dengan
      // SQLCipher. Tanpa ini open() mode "encryption"/"secret" menolak
      // dengan "No Encryption set in capacitor.config".
      // (Biometrik bawaan plugin TIDAK dipakai — app lock diatur React di
      // AppLock.tsx agar ada layar kunci + timeout background sendiri.)
      androidIsEncryption: true,
    },
  },
};

export default config;
