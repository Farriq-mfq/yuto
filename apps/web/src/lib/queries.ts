import { api, isErrorBody } from "./api";

export type TxKind = "expense" | "income";

/** Daftar transaksi satu bulan; `kind` hanya dikirim bila difilter. */
export async function fetchMonthTransactions(month: string, kind?: TxKind) {
  const { data, error } = await api.api.transactions.get({
    query: kind ? { month, kind } : { month },
  });
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data ?? [];
}

export type MonthTransaction = Awaited<
  ReturnType<typeof fetchMonthTransactions>
>[number];

/** Transaksi satu hari `YYYY-MM-DD` (zona Asia/Jakarta) untuk layar Activity. */
export async function fetchDayTransactions(date: string) {
  const { data, error } = await api.api.transactions.get({
    query: { date },
  });
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data ?? [];
}

export type DayTransaction = Awaited<
  ReturnType<typeof fetchDayTransactions>
>[number];

/**
 * Switch konfigurasi publik (`GET /api/config`). Bila `mapEnabled` false,
 * seksi lokasi disembunyikan total (tanpa request tile OSM).
 */
export async function fetchAppConfig() {
  const { data, error } = await api.api.config.get();
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  if (!data) throw new Error("Konfigurasi kosong.");
  return data;
}

export type AppConfig = Awaited<ReturnType<typeof fetchAppConfig>>;

/** Satu transaksi + rincian item; `null` bila sudah tidak ada. */
export async function fetchTransaction(id: string) {
  const { data, error } = await api.api.transactions({ id }).get();
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data;
}

export type TransactionDetail = NonNullable<
  Awaited<ReturnType<typeof fetchTransaction>>
>;

/** Ringkasan akun + saldo terhitung untuk opsi akun dan pratinjau. */
export async function fetchAccountsSummary() {
  const { data, error } = await api.api.accounts.summary.get();
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  if (!data) throw new Error("Ringkasan akun kosong.");
  return data;
}

export type AccountsSummary = Awaited<ReturnType<typeof fetchAccountsSummary>>;

/** Daftar kategori untuk select + resolve nama. */
export async function fetchCategories() {
  const { data, error } = await api.api.categories.get();
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data ?? [];
}

export type Category = Awaited<ReturnType<typeof fetchCategories>>[number];

export type AccountType = "bank" | "ewallet" | "cash";

/** Satu akun (tanpa saldo terhitung) untuk prefill form ubah. */
export async function fetchAccount(id: string) {
  const { data, error } = await api.api.accounts({ id }).get();
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data;
}

export type AccountDetail = NonNullable<
  Awaited<ReturnType<typeof fetchAccount>>
>;

/** N transfer terbaru untuk riwayat di layar Transfer. */
export async function fetchRecentTransfers(limit = 20) {
  const { data, error } = await api.api.transfers.get({
    query: { limit: String(limit) },
  });
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data ?? [];
}

export type TransferItem = Awaited<
  ReturnType<typeof fetchRecentTransfers>
>[number];

/** Ringkasan bulan (masuk/keluar/net) untuk layar Reports. */
export async function fetchReportSummary(month: string) {
  const { data, error } = await api.api.reports.summary.get({
    query: { month },
  });
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  if (!data) throw new Error("Ringkasan laporan kosong.");
  return data;
}

export type ReportSummary = Awaited<ReturnType<typeof fetchReportSummary>>;

/** Rincian per kategori untuk layar Reports. */
export async function fetchReportCategories(month: string, kind: TxKind) {
  const { data, error } = await api.api.reports.categories.get({
    query: { month, kind },
  });
  if (error) throw error;
  if (isErrorBody(data)) throw data;
  return data ?? [];
}

export type ReportCategory = Awaited<
  ReturnType<typeof fetchReportCategories>
>[number];
