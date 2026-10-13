/**
 * Statistik kartu saldo Beranda: delta 7 hari dari total saldo semua akun.
 * Pure function agar mudah dites; agregasi tetap client-side.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeltaTransaction {
  kind: string;
  amount: number;
  occurredAt: string | number | Date;
}

export interface WeekDeltaInput {
  /** Total kini dari `/accounts/summary` (dibawa agar pemanggil cukup
      mengoper satu potret; delta sendiri murni dari transaksi). */
  totalNow: number;
  /** Transaksi bulan berjalan + bulan lalu (clip: dua fetch itu cukup
      untuk jendela 7 hari). */
  transactions: ReadonlyArray<DeltaTransaction>;
  nowMs: number;
}

/**
 * Jumlah efek transaksi (`income` +, `expense` −) dengan
 * `occurredAt` STRICTLY dalam 7 hari terakhir (`> now − 7d`).
 *
 * why: transfer antar akun TIDAK mengubah total semua akun (keluar dari
 * satu akun = masuk ke akun lain), jadi jenis selain income/expense
 * sengaja diabaikan bila kelak muncul di daftar.
 */
// shortcut: agregat client, pindah ke endpoint server bila lambat.
export function weekDelta(input: WeekDeltaInput): { delta: number } {
  const cutoff = input.nowMs - WEEK_MS;
  let delta = 0;
  for (const tx of input.transactions) {
    if (new Date(tx.occurredAt).getTime() <= cutoff) continue;
    if (tx.kind === "income") delta += tx.amount;
    else if (tx.kind === "expense") delta -= tx.amount;
  }
  return { delta: Math.round(delta) };
}

/** Bulan lalu dari `"YYYY-MM"` (Januari → Desember tahun sebelumnya). */
export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  if (mon <= 1) return `${year - 1}-12`;
  return `${year}-${String(mon - 1).padStart(2, "0")}`;
}
