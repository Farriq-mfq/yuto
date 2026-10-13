# Aset Pihak Ketiga

Daftar aset/kode pihak ketiga yang di-bundle Yuto. Semua aset di-bundle
lokal (offline/self-host) — tidak ada hotlink/CDN.

## Logo institusi keuangan — `idn-finlogos`

- Paket: `idn-finlogos` (npm), dipakai di `apps/web` (`src/brands/index.ts`,
  hanya slug yang dipakai yang diimpor statis sehingga Vite hanya
  mem-bundle SVG tersebut).
- Pembuat/kurasi: Hafidz Noor Fauzi (hafidznoor/idn-finlogos) —
  <https://github.com/hafidznoor/idn-finlogos>
- Lisensi aset logo: Creative Commons Attribution-NonCommercial 4.0
  International (CC BY-NC 4.0) —
  <https://creativecommons.org/licenses/by-nc/4.0/> (teks lengkap:
  <https://creativecommons.org/licenses/by-nc/4.0/legalcode>).
- Logo/merek tetap milik pemegang merek masing-masing (bukan milik Yuto
  maupun paket tersebut); paket ini koleksi komunitas tidak resmi tanpa
  afiliasi/endorsement.
- Catatan non-komersial: Yuto dipakai pribadi dan non-komersial, sesuai
  syarat NonCommercial CC BY-NC 4.0. Jangan pakai logo ini untuk keperluan
  komersial tanpa izin pemegang merek.

## Font — Fontsource

- Paket: `@fontsource-variable/inter`,
  `@fontsource-variable/source-serif-4`, `@fontsource/ibm-plex-mono` (npm,
  OFL-licensed, di-bundle lokal via Vite).

## Ikon UI — Tabler Icons

- Paket: `@tabler/icons-react` (npm, MIT, komponen React di-bundle lokal).
