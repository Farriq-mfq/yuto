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

import bcaSvg from "idn-finlogos/icons/bca";
import briSvg from "idn-finlogos/icons/bri";
import bniSvg from "idn-finlogos/icons/bni";
import mandiriSvg from "idn-finlogos/icons/mandiri";
import btnSvg from "idn-finlogos/icons/btn";
import cimbNiagaSvg from "idn-finlogos/icons/cimb-niaga";
import danamonSvg from "idn-finlogos/icons/danamon";
import ocbcNispSvg from "idn-finlogos/icons/ocbc-nisp";
import jagoSvg from "idn-finlogos/icons/jago";
import jeniusSvg from "idn-finlogos/icons/jenius";
import bsiSvg from "idn-finlogos/icons/bsi";
import permataSvg from "idn-finlogos/icons/permata";
import maybankSvg from "idn-finlogos/icons/maybank";
import paninbankSvg from "idn-finlogos/icons/paninbank";
import uobSvg from "idn-finlogos/icons/uob";
import dbsSvg from "idn-finlogos/icons/dbs";
import gopaySvg from "idn-finlogos/icons/gopay";
import ovoSvg from "idn-finlogos/icons/ovo";
import danaSvg from "idn-finlogos/icons/dana";
import shopeePaySvg from "idn-finlogos/icons/shopee-pay";
import linkajaSvg from "idn-finlogos/icons/linkaja";
import isakuSvg from "idn-finlogos/icons/i-saku";
import flazzSvg from "idn-finlogos/icons/bca-flazz";
import brizziSvg from "idn-finlogos/icons/bri-brizzi";
import emoneySvg from "idn-finlogos/icons/mandiri-e-money";
import tapcashSvg from "idn-finlogos/icons/bni-tapcash";
import jakcardSvg from "idn-finlogos/icons/jakcard";

/** Brand kartu akun: logo SVG (string markup) + warna kartu, atau tile inisial (tunai/cash/dompet). */
export type Brand =
  | {
      kind: "logo";
      svg: string;
      label: string;
      /**
       * Warna latar kartu akun (data brand, bukan token desain —
       * preseden sama seperti dot kategori di Reports). Selalu gelap
       * agar teks putih di atasnya lolos kontras AA (lihat test
       * `brandCardBackground`); tile logo tetap putih.
       */
      background: string;
    }
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
  | { logo: string; label: string; background: string }
  | { initials: string; background: string };

// why: warna kartu + tile tunai data brand, bukan token desain — preseden
// sama seperti dot kategori di Reports. Latar kartu logo selalu versi
// gelap warna brand agar teks putih lolos kontras AA (4.5:1); oranye BNI
// asli (#F26522), kuning Maybank, dan merah/oranye terang lain digelapkan
// atau diganti hitam/abu gelap dengan catatan di bawah.
const BRANDS: Record<string, BrandDef> = {
  // Bank
  bca: { logo: bcaSvg, label: "BCA", background: "#0B3D91" },
  bri: { logo: briSvg, label: "BRI", background: "#00529C" },
  // BNI oranye (#F26522) gagal AA dengan teks putih -> oranye gelap.
  bni: { logo: bniSvg, label: "BNI", background: "#9A3412" },
  mandiri: { logo: mandiriSvg, label: "Mandiri", background: "#003D79" },
  btn: { logo: btnSvg, label: "BTN", background: "#0066B3" },
  cimb: { logo: cimbNiagaSvg, label: "CIMB Niaga", background: "#C41E2F" },
  // Danamon memakai hijau gelap (elemen hijau di logonya); oranye terang
  // logonya tidak lolos kontras AA.
  danamon: { logo: danamonSvg, label: "Danamon", background: "#166534" },
  ocbc: { logo: ocbcNispSvg, label: "OCBC", background: "#B91C1C" },
  jago: { logo: jagoSvg, label: "Jago", background: "#1E3A8A" },
  jenius: { logo: jeniusSvg, label: "Jenius", background: "#0369A1" },
  bsi: { logo: bsiSvg, label: "BSI", background: "#0F766E" },
  permata: { logo: permataSvg, label: "Permata", background: "#991B1B" },
  // Kuning Maybank tidak lolos AA dengan teks putih -> hitam khas brand.
  maybank: { logo: maybankSvg, label: "Maybank", background: "#1F2937" },
  panin: { logo: paninbankSvg, label: "Panin", background: "#1D4ED8" },
  uob: { logo: uobSvg, label: "UOB", background: "#002469" },
  dbs: { logo: dbsSvg, label: "DBS", background: "#111827" },
  // E-wallet
  gopay: { logo: gopaySvg, label: "GoPay", background: "#0E7490" },
  ovo: { logo: ovoSvg, label: "OVO", background: "#6B21A8" },
  dana: { logo: danaSvg, label: "DANA", background: "#075985" },
  shopeepay: {
    logo: shopeePaySvg,
    label: "ShopeePay",
    background: "#C2410C",
  },
  linkaja: { logo: linkajaSvg, label: "LinkAja", background: "#BE123C" },
  isaku: { logo: isakuSvg, label: "i.saku", background: "#0C4A6E" },
  // E-money
  flazz: { logo: flazzSvg, label: "BCA Flazz", background: "#1E40AF" },
  brizzi: { logo: brizziSvg, label: "BRI BRIZZI", background: "#004E9E" },
  emoney: { logo: emoneySvg, label: "Mandiri e-money", background: "#B45309" },
  // Satu keluarga brand BNI -> sama dengan kartu BNI.
  tapcash: { logo: tapcashSvg, label: "BNI TapCash", background: "#9A3412" },
  jakcard: { logo: jakcardSvg, label: "JakCard", background: "#7F1D1D" },
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
  if ("logo" in def)
    return {
      kind: "logo",
      svg: def.logo,
      label: def.label,
      background: def.background,
    };
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
