<p align="center">
  <img src="apps/web/src/logo/yuto-icon.svg" width="96" height="96" alt="Logo Yuto">
</p>

# Yuto

Yuto ("juta" dalam bahasa Jawa) adalah pencatat keuangan pribadi yang di-hosting sendiri: satu aplikasi untuk mencatat transaksi, melihat saldo semua akun, dan memahami pengeluaran bulanan per kategori. Satu pengguna (pemilik server), tanpa akun cloud, tanpa langganan, tanpa telemetri.

Syarat: **Docker + Docker Compose**. Tidak perlu Bun/Node untuk instalasi produksi.

## Instalasi

```bash
git clone https://github.com/Farriq-mfq/yuto.git
cd yuto
cp .env.example .env
```

Isi 3 secret di `.env` (wajib, API menolak start jika kosong/contoh/kurang panjang):

| Variabel | Syarat |
|---|---|
| `POSTGRES_PASSWORD` | password database, samakan dengan yang di `DATABASE_URL` |
| `JWT_SECRET` | string acak **minimal 32 karakter**, bukan nilai contoh |
| `YUTO_PASSWORD` | password pemilik, **minimal 12 karakter**, bukan nilai contoh |

Jalankan dan buka aplikasinya:

```bash
docker compose up -d --build
```

Buka `http://<host>:8080`, login dengan isi `YUTO_PASSWORD`.

## Akses & ganti password

Satu pemilik, tanpa registrasi. Semua halaman kecuali login butuh sesi. Untuk ganti password, edit `.env` lalu terapkan ulang:

```bash
# edit YUTO_PASSWORD di .env, lalu:
docker compose up -d
```

## HTTPS di balik reverse proxy

Yuto tidak terminasi TLS sendiri. Pasang di balik reverse proxy (Caddy, Traefik, nginx) dan biarkan `COOKIE_SECURE=true` di `.env`. Jangan expose HTTP polos ke internet.

Contoh Caddy minimal (HTTPS otomatis):

```caddy
yuto.contoh.id {
	reverse_proxy 127.0.0.1:8080
}
```

Catatan nginx: terminasi TLS di nginx, lalu `proxy_pass http://127.0.0.1:8080;`. Pengecualian `COOKIE_SECURE=false` hanya untuk LAN tepercaya via HTTP polos.

## Backup

```bash
docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB > yuto-$(date +%F).sql
```

Simpan salinannya di luar mesin. Lakukan backup sebelum setiap upgrade.

## Restore

Mulai stack baru yang masih kosong, lalu impor file backup:

```bash
docker compose up -d --build
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < yuto-YYYY-MM-DD.sql
```

## Upgrade

```bash
# 1. backup dulu (perintah Backup di atas)
git pull
docker compose up -d --build
```

Migrasi database berjalan otomatis saat start dan hanya bergerak maju.

## Aplikasi Android

APK rilis (`app.yuto`, `com.farriq.yuto`) dilampirkan di setiap GitHub
Release (dibangun + ditandatangani oleh CI). Install manual dari file APK;
tidak ada di Play Store.

- Data tersimpan **di HP** (SQLite terenkripsi, bukan server). Login
  password tidak ada di aplikasi Android — sebagai gantinya **kunci
  aplikasi**: biometrik, atau PIN/pola/sandi layar kunci bila biometrik
  tidak tersedia. Tanpa kunci layar, aplikasi menolak berjalan.
- Backup cloud Android **dimatikan** (`allowBackup=false`): backup bawaan
  tidak bisa mengembalikan DB terenkripsi. Backup manual via
  **export** di aplikasi (satu file berversi), restore via **import**.
  Simpan file export di luar HP.
- Peta lokasi butuh internet untuk memuat tile; offline, picker menampilkan
  pesan dan nama lokasi tetap bisa diisi manual.

## Dev lokal (singkat)

```bash
bun install
docker compose up -d db
bun run dev     # api + web paralel; atau: bun run dev:api / bun run dev:web
bun test
```

Dokumen lanjutan: `docs/PRD.md`, `docs/TRD.md`, `docs/APP_FLOW.md`, `docs/BACKGROUND_SCHEMA.md`, `docs/DESIGN_BRIEF.md`, `docs/THIRD_PARTY.md`, `docs/IMPLEMENTATION_PLAN.md`.

## Lisensi

Kode Yuto berlisensi MIT — lihat `LICENSE`. Logo institusi keuangan
(`idn-finlogos`) berlisensi CC BY-NC 4.0 dan merek milik pemegangnya
masing-masing; detailnya di `docs/THIRD_PARTY.md`.
