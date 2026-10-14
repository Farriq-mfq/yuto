import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farriq.yuto',
  appName: 'Yuto',
  webDir: 'dist',
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
