import { api, isErrorBody } from "./api";
import type {
  CreateAccountInput,
  CreateTransactionInput,
  CreateTransferInput,
  DataSource,
  TxKind,
  UpdateAccountInput,
  UpdateTransactionInput,
} from "./datasource";

/** DataSource di atas klien Eden Treaty (HTTP ke API yang sama). */
export class HttpDataSource implements DataSource {
  /** Daftar transaksi satu bulan; `kind` hanya dikirim bila difilter. */
  async getMonthTransactions(month: string, kind?: TxKind) {
    const { data, error } = await api.api.transactions.get({
      query: kind ? { month, kind } : { month },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data ?? [];
  }

  /** Transaksi satu hari `YYYY-MM-DD` (zona Asia/Jakarta) untuk layar Activity. */
  async getDayTransactions(date: string) {
    const { data, error } = await api.api.transactions.get({
      query: { date },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data ?? [];
  }

  /**
   * Switch konfigurasi publik (`GET /api/config`). Bila `mapEnabled` false,
   * seksi lokasi disembunyikan total (tanpa request tile OSM).
   */
  async getAppConfig() {
    const { data, error } = await api.api.config.get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    if (!data) throw new Error("Konfigurasi kosong.");
    return data;
  }

  /** Satu transaksi + rincian item; `null` bila sudah tidak ada. */
  async getTransaction(id: string) {
    const { data, error } = await api.api.transactions({ id }).get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data;
  }

  /** Ringkasan akun + saldo terhitung untuk opsi akun dan pratinjau. */
  async getAccountsSummary() {
    const { data, error } = await api.api.accounts.summary.get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    if (!data) throw new Error("Ringkasan akun kosong.");
    return data;
  }

  /** Daftar kategori untuk select + resolve nama. */
  async getCategories() {
    const { data, error } = await api.api.categories.get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data ?? [];
  }

  /** Satu akun (tanpa saldo terhitung) untuk prefill form ubah. */
  async getAccount(id: string) {
    const { data, error } = await api.api.accounts({ id }).get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data;
  }

  /** N transfer terbaru untuk riwayat di layar Transfer. */
  async getRecentTransfers(limit = 20) {
    const { data, error } = await api.api.transfers.get({
      query: { limit: String(limit) },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data ?? [];
  }

  /** Ringkasan bulan (masuk/keluar/net) untuk layar Reports. */
  async getReportSummary(month: string) {
    const { data, error } = await api.api.reports.summary.get({
      query: { month },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    if (!data) throw new Error("Ringkasan laporan kosong.");
    return data;
  }

  /** Rincian per kategori untuk layar Reports. */
  async getReportCategories(month: string, kind: TxKind) {
    const { data, error } = await api.api.reports.categories.get({
      query: { month, kind },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return data ?? [];
  }

  async login(password: string): Promise<void> {
    const { error } = await api.api.auth.login.post({ password });
    if (error) throw error;
  }

  async createAccount(input: CreateAccountInput): Promise<void> {
    const { error } = await api.api.accounts.post(input);
    if (error) throw error;
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<void> {
    const { error } = await api.api.accounts({ id }).patch(input);
    if (error) throw error;
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await api.api.accounts({ id }).delete();
    if (error) throw error;
  }

  async createTransaction(input: CreateTransactionInput): Promise<void> {
    const { error } = await api.api.transactions.post(input);
    if (error) throw error;
  }

  async updateTransaction(
    id: string,
    input: UpdateTransactionInput,
  ): Promise<void> {
    const { error } = await api.api.transactions({ id }).patch(input);
    if (error) throw error;
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await api.api.transactions({ id }).delete();
    if (error) throw error;
  }

  async createTransfer(input: CreateTransferInput): Promise<void> {
    const { error } = await api.api.transfers.post(input);
    if (error) throw error;
  }

  async deleteTransfer(id: string): Promise<void> {
    const { error } = await api.api.transfers({ id }).delete();
    if (error) throw error;
  }
}
