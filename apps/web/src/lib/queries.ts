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
