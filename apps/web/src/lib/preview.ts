/** Pratinjau saldo akun saat mencatat/mengubah transaksi. Integer rupiah saja. */

export type PreviewKind = "expense" | "income";

export interface PreviewInput {
  currentBalance: number;
  kind: PreviewKind;
  amount: number;
}

export interface PreviewResult {
  before: number;
  after: number;
}

/**
 * `before` = saldo kini, `after` = saldo setelah transaksi diterapkan
 * (income menambah, expense mengurangi). Nilai dibulatkan ke rupiah utuh
 * agar pecahan dari input tak pernah lolos ke pratinjau.
 */
export function previewBalance({
  currentBalance,
  kind,
  amount,
}: PreviewInput): PreviewResult {
  const before = Math.round(currentBalance);
  const value = Math.round(amount);
  return {
    before,
    after: kind === "income" ? before + value : before - value,
  };
}

export interface BalanceBeforeTxInput {
  currentBalance: number;
  txKind: PreviewKind;
  txAmount: number;
}

/**
 * Saldo akun *sebelum* transaksi ini dicatat (untuk mode edit): keluarkan
 * dulu efek transaksi tersebut dari saldo kini, lalu pratinjau dihitung
 * dari angka tersebut.
 */
export function balanceBeforeTx({
  currentBalance,
  txKind,
  txAmount,
}: BalanceBeforeTxInput): number {
  const current = Math.round(currentBalance);
  const value = Math.round(txAmount);
  return txKind === "income" ? current - value : current + value;
}
