/**
 * Peta brand institusi Indonesia ke tile dekoratif kartu akun Dompet.
 *
 * Semua data lokal/offline: tidak ada logo gambar, tidak ada hotlink/CDN
 * (janji self-host). Tile hanya inisial 1-2 huruf di atas warna brand.
 * Bila institusi tidak dikenal, pemanggil memakai ikon tipe akun
 * (lihat `fallbackIconName`).
 */

export interface Brand {
  /** Inisial 1-2 huruf untuk tile, mis. "BC" untuk BCA. */
  initials: string;
  /** Warna latar tile. */
  background: string;
  /** Warna teks tile, selalu putih. */
  foreground: "#fff";
}

/** Nama ikon fallback per tipe akun (dipetakan ke `@/icons` oleh pemanggil). */
export type FallbackIconName = "landmark" | "wallet" | "banknote";

// why: warna data brand, bukan token desain — preseden sama seperti dot
// kategori di Reports. Tile bersifat dekoratif (`aria-hidden`); makna
// dibawa oleh nama akun di sebelahnya.
const BRANDS: Record<string, { initials: string; background: string }> = {
  // Bank
  bca: { initials: "BC", background: "#0B3D91" },
  bri: { initials: "BR", background: "#0072CE" },
  bni: { initials: "BN", background: "#F26522" },
  mandiri: { initials: "MA", background: "#003D79" },
  btn: { initials: "BT", background: "#005BAA" },
  cimb: { initials: "CI", background: "#EC1C24" },
  danamon: { initials: "DA", background: "#009444" },
  ocbc: { initials: "OC", background: "#E1251B" },
  jago: { initials: "JA", background: "#A16207" },
  jenius: { initials: "JE", background: "#0099D8" },
  bsi: { initials: "BS", background: "#007A5E" },
  permata: { initials: "PE", background: "#009A93" },
  maybank: { initials: "MB", background: "#B45309" },
  panin: { initials: "PA", background: "#0057A8" },
  uob: { initials: "UO", background: "#002469" },
  dbs: { initials: "DB", background: "#C41230" },
  // E-wallet
  gopay: { initials: "GP", background: "#00AED6" },
  ovo: { initials: "OV", background: "#5C2D91" },
  dana: { initials: "DA", background: "#108EE9" },
  shopeepay: { initials: "SP", background: "#EE4D2D" },
  linkaja: { initials: "LA", background: "#DF1F26" },
  isaku: { initials: "IS", background: "#EA8600" },
  // E-money
  flazz: { initials: "FL", background: "#4338CA" },
  brizzi: { initials: "BR", background: "#0284C7" },
  emoney: { initials: "EM", background: "#DC2626" },
  tapcash: { initials: "TA", background: "#EA580C" },
  jakcard: { initials: "JK", background: "#BE123C" },
  // Tunai
  tunai: { initials: "TU", background: "#15803D" },
  cash: { initials: "CA", background: "#15803D" },
  dompet: { initials: "DO", background: "#475569" },
};

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
 * Brand untuk pasangan institusi + tipe akun, atau `null` bila tak dikenal
 * (pemanggil memakai ikon fallback per tipe). `type` diterima sebagai string
 * bebas agar tipe asing tidak membuat fungsi ini crash; pencocokan brand
 * sendiri tidak bergantung pada tipe.
 */
export function brandFor(institution: string, _type: string): Brand | null {
  const key = normalizeInstitution(institution);
  if (!key) return null;
  const exact = BRANDS[key];
  if (exact) return { ...exact, foreground: "#fff" as const };
  // "Bank BCA" tetap dapat tile BCA; kunci terpanjang dicoba dulu supaya
  // "brizzi" tidak tertelan "bri".
  for (const candidate of KEYS_LONGEST_FIRST) {
    if (key.includes(candidate)) {
      const found = BRANDS[candidate];
      return { initials: found.initials, background: found.background, foreground: "#fff" as const };
    }
  }
  return null;
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
