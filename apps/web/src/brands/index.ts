/**
 * Peta brand institusi Indonesia ke logo kartu akun Dompet.
 *
 * Logo bank/e-wallet/e-money: "Indonesian fintech logos by Hafidz Noor
 * Fauzi (hafidznoor/idn-finlogos), CC BY-NC 4.0,
 * https://github.com/hafidznoor/idn-finlogos — merek milik pemegangnya
 * masing-masing. Lisensi aset:
 * https://creativecommons.org/licenses/by-nc/4.0/ (lihat juga
 * docs/THIRD_PARTY.md). Hanya slug yang dipakai yang diimpor statis di
 * file ini sehingga Vite hanya mem-bundle SVG tersebut (aset lokal/offline,
 * bukan hotlink/CDN — janji self-host terjaga).
 *
 * Tunai/cash/dompet tidak punya logo di paket tersebut sehingga tetap
 * memakai tile inisial dekoratif (`aria-hidden`; makna dibawa oleh nama
 * akun di sebelahnya). Bila institusi tidak dikenal, pemanggil memakai
 * ikon tipe akun (lihat `fallbackIconName`).
 */

import bcaUrl from "idn-finlogos/icons/bca.svg";
import briUrl from "idn-finlogos/icons/bri.svg";
import bniUrl from "idn-finlogos/icons/bni.svg";
import mandiriUrl from "idn-finlogos/icons/mandiri.svg";
import btnUrl from "idn-finlogos/icons/btn.svg";
import cimbNiagaUrl from "idn-finlogos/icons/cimb-niaga.svg";
import danamonUrl from "idn-finlogos/icons/danamon.svg";
import ocbcNispUrl from "idn-finlogos/icons/ocbc-nisp.svg";
import jagoUrl from "idn-finlogos/icons/jago.svg";
import jeniusUrl from "idn-finlogos/icons/jenius.svg";
import bsiUrl from "idn-finlogos/icons/bsi.svg";
import permataUrl from "idn-finlogos/icons/permata.svg";
import maybankUrl from "idn-finlogos/icons/maybank.svg";
import paninbankUrl from "idn-finlogos/icons/paninbank.svg";
import uobUrl from "idn-finlogos/icons/uob.svg";
import dbsUrl from "idn-finlogos/icons/dbs.svg";
import gopayUrl from "idn-finlogos/icons/gopay.svg";
import ovoUrl from "idn-finlogos/icons/ovo.svg";
import danaUrl from "idn-finlogos/icons/dana.svg";
import shopeePayUrl from "idn-finlogos/icons/shopee-pay.svg";
import linkajaUrl from "idn-finlogos/icons/linkaja.svg";
import isakuUrl from "idn-finlogos/icons/i-saku.svg";
import flazzUrl from "idn-finlogos/icons/bca-flazz.svg";
import brizziUrl from "idn-finlogos/icons/bri-brizzi.svg";
import emoneyUrl from "idn-finlogos/icons/mandiri-e-money.svg";
import tapcashUrl from "idn-finlogos/icons/bni-tapcash.svg";
import jakcardUrl from "idn-finlogos/icons/jakcard.svg";

/** Brand kartu akun: logo gambar atau tile inisial (tunai/cash/dompet). */
export type Brand =
  | { kind: "logo"; src: string; label: string }
  | {
      kind: "tile";
      /** Inisial 1-2 huruf untuk tile, mis. "TU" untuk Tunai. */
      initials: string;
      /** Warna latar tile. */
      background: string;
      /** Warna teks tile, selalu putih. */
      foreground: "#fff";
    };

/** Nama ikon fallback per tipe akun (dipetakan ke `@/icons` oleh pemanggil). */
export type FallbackIconName = "landmark" | "wallet" | "banknote";

/** Kelompok brand: bank / e-wallet / e-money / tunai. */
export type BrandKind = "bank" | "ewallet" | "emoney" | "cash";

/** Tab tipe akun pemakai opsi institusi (sama dengan `AccountType`). */
export type InstitutionGroup = "bank" | "ewallet" | "cash";

/** Satu opsi dropdown institusi. */
export interface BrandOption {
  key: string;
  name: string;
  kind: BrandKind;
}

type BrandDef =
  | { logo: string; label: string }
  | { initials: string; background: string };

// why: warna tile tunai data brand, bukan token desain — preseden sama
// seperti dot kategori di Reports.
const BRANDS: Record<string, BrandDef> = {
  // Bank
  bca: { logo: bcaUrl, label: "BCA" },
  bri: { logo: briUrl, label: "BRI" },
  bni: { logo: bniUrl, label: "BNI" },
  mandiri: { logo: mandiriUrl, label: "Mandiri" },
  btn: { logo: btnUrl, label: "BTN" },
  cimb: { logo: cimbNiagaUrl, label: "CIMB Niaga" },
  danamon: { logo: danamonUrl, label: "Danamon" },
  ocbc: { logo: ocbcNispUrl, label: "OCBC" },
  jago: { logo: jagoUrl, label: "Jago" },
  jenius: { logo: jeniusUrl, label: "Jenius" },
  bsi: { logo: bsiUrl, label: "BSI" },
  permata: { logo: permataUrl, label: "Permata" },
  maybank: { logo: maybankUrl, label: "Maybank" },
  panin: { logo: paninbankUrl, label: "Panin" },
  uob: { logo: uobUrl, label: "UOB" },
  dbs: { logo: dbsUrl, label: "DBS" },
  // E-wallet
  gopay: { logo: gopayUrl, label: "GoPay" },
  ovo: { logo: ovoUrl, label: "OVO" },
  dana: { logo: danaUrl, label: "DANA" },
  shopeepay: { logo: shopeePayUrl, label: "ShopeePay" },
  linkaja: { logo: linkajaUrl, label: "LinkAja" },
  isaku: { logo: isakuUrl, label: "i.saku" },
  // E-money
  flazz: { logo: flazzUrl, label: "BCA Flazz" },
  brizzi: { logo: brizziUrl, label: "BRI BRIZZI" },
  emoney: { logo: emoneyUrl, label: "Mandiri e-money" },
  tapcash: { logo: tapcashUrl, label: "BNI TapCash" },
  jakcard: { logo: jakcardUrl, label: "JakCard" },
  // Tunai (tetap tile — tidak ada logo di paket)
  tunai: { initials: "TU", background: "#15803D" },
  cash: { initials: "CA", background: "#15803D" },
  dompet: { initials: "DO", background: "#475569" },
};

/** Kelompok tiap kunci brand (satu kunci = satu kelompok). */
const BRAND_KINDS: Record<string, BrandKind> = {
  bca: "bank",
  bri: "bank",
  bni: "bank",
  mandiri: "bank",
  btn: "bank",
  cimb: "bank",
  danamon: "bank",
  ocbc: "bank",
  jago: "bank",
  jenius: "bank",
  bsi: "bank",
  permata: "bank",
  maybank: "bank",
  panin: "bank",
  uob: "bank",
  dbs: "bank",
  gopay: "ewallet",
  ovo: "ewallet",
  dana: "ewallet",
  shopeepay: "ewallet",
  linkaja: "ewallet",
  isaku: "ewallet",
  flazz: "emoney",
  brizzi: "emoney",
  emoney: "emoney",
  tapcash: "emoney",
  jakcard: "emoney",
  tunai: "cash",
  cash: "cash",
  dompet: "cash",
};

/**
 * Nama proper tiap kunci brand untuk dropdown institusi. E-money memakai
 * nama produk (bukan nama bank penerbit) agar selaras dengan kartu fisik.
 */
export const DISPLAY_NAMES: Record<string, string> = {
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  mandiri: "Bank Mandiri",
  btn: "BTN",
  cimb: "CIMB Niaga",
  danamon: "Danamon",
  ocbc: "OCBC",
  jago: "Jago",
  jenius: "Jenius",
  bsi: "BSI",
  permata: "Permata",
  maybank: "Maybank",
  panin: "Panin",
  uob: "UOB",
  dbs: "DBS",
  gopay: "GoPay",
  ovo: "OVO",
  dana: "DANA",
  shopeepay: "ShopeePay",
  linkaja: "LinkAja",
  isaku: "i.saku",
  flazz: "Flazz",
  brizzi: "BRIZZI",
  emoney: "e-Money",
  tapcash: "TapCash",
  jakcard: "JakCard",
  tunai: "Tunai",
  cash: "Cash",
  dompet: "Dompet",
};

/** Seluruh opsi institusi sesuai urutan definisi (bank, e-wallet, e-money, tunai). */
export const BRAND_OPTIONS: readonly BrandOption[] = Object.keys(BRANDS).map(
  (key) => ({ key, name: DISPLAY_NAMES[key], kind: BRAND_KINDS[key] }),
);

/** Kelompok brand yang tampil per tab tipe akun. */
const GROUP_KINDS: Record<InstitutionGroup, readonly BrandKind[]> = {
  bank: ["bank"],
  ewallet: ["ewallet", "emoney"],
  cash: ["cash"],
};

/**
 * Opsi institusi untuk satu tab tipe akun: bank -> bank saja,
 * ewallet -> e-wallet + e-money, cash -> tunai saja.
 */
export function listInstitutions(group: InstitutionGroup): BrandOption[] {
  const kinds = GROUP_KINDS[group];
  return BRAND_OPTIONS.filter((option) => kinds.includes(option.kind));
}

function toBrand(def: BrandDef): Brand {
  if ("logo" in def) return { kind: "logo", src: def.logo, label: def.label };
  return {
    kind: "tile",
    initials: def.initials,
    background: def.background,
    foreground: "#fff" as const,
  };
}

/** Urutan kunci terpanjang dulu agar pencocokan substring tidak salah arah. */
const KEYS_LONGEST_FIRST = Object.keys(BRANDS).sort((a, b) => b.length - a.length);

/**
 * Normalisasi nama institusi: lowercase, trim, hapus spasi/titik/strip.
 * Mis. " BCA " -> "bca", "Go-Pay" -> "gopay", "B.T.N" -> "btn".
 */
export function normalizeInstitution(institution: string): string {
  return institution
    .toLowerCase()
    .trim()
    .replace(/[\s.\-_/]/g, "");
}

/**
 * Kunci brand yang dikenal untuk sebuah nama institusi, atau `null` bila
 * tak dikenal. Aturan pencocokan sama dengan `brandFor` (exact dulu, lalu
 * substring terpanjang dulu) agar prefill form selalu konsisten dengan
 * logo yang tampil di kartu.
 */
export function brandKeyFor(institution: string): string | null {
  const key = normalizeInstitution(institution);
  if (!key) return null;
  if (BRANDS[key]) return key;
  // "Bank BCA" tetap dapat logo BCA; kunci terpanjang dicoba dulu supaya
  // "brizzi" tidak tertelan "bri".
  for (const candidate of KEYS_LONGEST_FIRST) {
    if (key.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Brand untuk pasangan institusi + tipe akun, atau `null` bila tak dikenal
 * (pemanggil memakai ikon fallback per tipe). `type` diterima sebagai string
 * bebas agar tipe asing tidak membuat fungsi ini crash; pencocokan brand
 * sendiri tidak bergantung pada tipe.
 */
export function brandFor(institution: string, _type: string): Brand | null {
  const key = brandKeyFor(institution);
  if (!key) return null;
  return toBrand(BRANDS[key]);
}

/**
 * Ikon fallback per tipe akun: bank -> Landmark, ewallet -> Wallet,
 * cash -> Banknote. Tipe asing/undefined aman: jatuh ke Wallet.
 */
export function fallbackIconName(type: string | undefined): FallbackIconName {
  if (type === "bank") return "landmark";
  if (type === "cash") return "banknote";
  return "wallet";
}
