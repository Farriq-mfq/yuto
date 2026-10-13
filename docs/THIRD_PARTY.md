# <img src="../apps/web/src/logo/yuto-icon-64.png" height="28" alt="Logo Yuto"> Aset Pihak Ketiga

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

### Cakupan brand di Yuto

Pemetaan nama institusi → slug dipakai `apps/web/src/brands/index.ts`
(pencocokan case-insensitive, "Bank BCA" cocok ke BCA). Institusi di luar
daftar memakai tile inisial/ikon tipe. Slug menaut ke file SVG upstream
untuk referensi (aplikasi mem-bundle lokal, bukan hotlink).

<details>
<summary>Bank (16)</summary>

| Brand | Slug |
|---|---|
| BCA | [`bca`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bca.svg) |
| BRI | [`bri`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bri.svg) |
| BNI | [`bni`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bni.svg) |
| Bank Mandiri | [`mandiri`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/mandiri.svg) |
| BTN | [`btn`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/btn.svg) |
| CIMB Niaga | [`cimb-niaga`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/cimb-niaga.svg) |
| Danamon | [`danamon`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/danamon.svg) |
| OCBC | [`ocbc-nisp`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/ocbc-nisp.svg) |
| Jago | [`jago`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/jago.svg) |
| Jenius | [`jenius`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/jenius.svg) |
| BSI | [`bsi`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bsi.svg) |
| Permata | [`permata`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/permata.svg) |
| Maybank | [`maybank`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/maybank.svg) |
| Panin | [`paninbank`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/paninbank.svg) |
| UOB | [`uob`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/uob.svg) |
| DBS | [`dbs`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/dbs.svg) |

</details>

<details>
<summary>E-wallet (6)</summary>

| Brand | Slug |
|---|---|
| GoPay | [`gopay`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/gopay.svg) |
| OVO | [`ovo`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/ovo.svg) |
| DANA | [`dana`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/dana.svg) |
| ShopeePay | [`shopee-pay`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/shopee-pay.svg) |
| LinkAja | [`linkaja`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/linkaja.svg) |
| i.saku | [`i-saku`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/i-saku.svg) |

</details>

<details>
<summary>E-money (5)</summary>

| Brand | Slug |
|---|---|
| Flazz | [`bca-flazz`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bca-flazz.svg) |
| BRIZZI | [`bri-brizzi`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bri-brizzi.svg) |
| e-Money | [`mandiri-e-money`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/mandiri-e-money.svg) |
| TapCash | [`bni-tapcash`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/bni-tapcash.svg) |
| JakCard | [`jakcard`](https://github.com/hafidznoor/idn-finlogos/blob/main/icons/jakcard.svg) |

</details>

<details>
<summary>Tunai (tile inisial, tanpa logo)</summary>

Tunai, Cash, Dompet.

</details>

## Font — Fontsource

- Paket: `@fontsource-variable/inter`,
  `@fontsource-variable/source-serif-4`, `@fontsource/ibm-plex-mono` (npm,
  OFL-licensed, di-bundle lokal via Vite).

## Ikon UI — Tabler Icons

- Paket: `@tabler/icons-react` (npm, MIT, komponen React di-bundle lokal).
