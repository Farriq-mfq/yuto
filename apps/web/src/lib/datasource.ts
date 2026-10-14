import type { api } from "./api";
import type { HttpDataSource } from "./httpDataSource";

// Helper error HTTP tetap dipakai layar untuk alur 401/keamanan;
// di-re-export dari sini agar tak ada layar yang import modul Eden langsung.
export { errorStatus, isUnauthorized } from "./api";

export type TxKind = "expense" | "income";

export type AccountType = "bank" | "ewallet" | "cash";

// Tipe baris/daftar diturunkan dari method HttpDataSource (pola yang sama
// seperti queries.ts dulu) agar tipe selalu sama dengan implementasi,
// tanpa duplikasi definisi.
export type MonthTransaction = Awaited<
  ReturnType<HttpDataSource["getMonthTransactions"]>
>[number];

export type DayTransaction = Awaited<
  ReturnType<HttpDataSource["getDayTransactions"]>
>[number];

export type TransactionDetail = NonNullable<
  Awaited<ReturnType<HttpDataSource["getTransaction"]>>
>;

export type AccountsSummary = Awaited<
  ReturnType<HttpDataSource["getAccountsSummary"]>
>;

export type Category = Awaited<
  ReturnType<HttpDataSource["getCategories"]>
>[number];

export type AccountDetail = NonNullable<
  Awaited<ReturnType<HttpDataSource["getAccount"]>>
>;

export type TransferItem = Awaited<
  ReturnType<HttpDataSource["getRecentTransfers"]>
>[number];

export type ReportSummary = Awaited<
  ReturnType<HttpDataSource["getReportSummary"]>
>;

export type ReportCategory = Awaited<
  ReturnType<HttpDataSource["getReportCategories"]>
>[number];

export type AppConfig = Awaited<ReturnType<HttpDataSource["getAppConfig"]>>;

// Input mutasi = tepat tipe body route Eden (tanpa duplikasi tipe API).
export type CreateAccountInput = Parameters<typeof api.api.accounts.post>[0];
export type UpdateAccountInput = Parameters<
  ReturnType<typeof api.api.accounts>["patch"]
>[0];
export type CreateTransactionInput = Parameters<
  typeof api.api.transactions.post
>[0];
export type UpdateTransactionInput = Parameters<
  ReturnType<typeof api.api.transactions>["patch"]
>[0];
export type CreateTransferInput = Parameters<typeof api.api.transfers.post>[0];

/**
 * Seluruh akses data UI. Implementasi HTTP melempar nilai error Eden yang
 * sama seperti sebelumnya, sehingga alur 401/429/404/409 di layar tak
 * berubah (cek via `errorStatus`/`isUnauthorized` di catch).
 */
export interface DataSource {
  getMonthTransactions(
    month: string,
    kind?: TxKind,
  ): Promise<MonthTransaction[]>;
  getDayTransactions(date: string): Promise<DayTransaction[]>;
  getTransaction(id: string): Promise<TransactionDetail | null>;
  getAccountsSummary(): Promise<AccountsSummary>;
  getAccount(id: string): Promise<AccountDetail | null>;
  getCategories(): Promise<Category[]>;
  getRecentTransfers(limit?: number): Promise<TransferItem[]>;
  getReportSummary(month: string): Promise<ReportSummary>;
  getReportCategories(month: string, kind: TxKind): Promise<ReportCategory[]>;
  getAppConfig(): Promise<AppConfig>;
  login(password: string): Promise<void>;
  createAccount(input: CreateAccountInput): Promise<void>;
  updateAccount(id: string, input: UpdateAccountInput): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  createTransaction(input: CreateTransactionInput): Promise<void>;
  updateTransaction(id: string, input: UpdateTransactionInput): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  createTransfer(input: CreateTransferInput): Promise<void>;
  deleteTransfer(id: string): Promise<void>;
}
