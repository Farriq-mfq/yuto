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

// why: kolom sync (deletedAt/serverSeq/slug/...) milik protokol sinkronisasi,
// bukan kontrak UI. Setiap read me-whitelist-pick field kontrak UI saja,
// sehingga kolom sync — sekarang maupun yang ditambahkan migrasi nanti — tak
// bocor ke tipe turunan Eden dan LocalDataSource tetap memenuhi DataSource
// tanpa diubah (pairing sync Phase 11 nanti tambah method sendiri).

/** Item transaksi: kontrak UI (tanpa deletedAt/serverSeq). */
function stripTransactionItemSync(item: {
  id: string;
  transactionId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}) {
  return {
    id: item.id,
    transactionId: item.transactionId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  };
}

/**
 * Transaksi: kontrak UI. createdAt/updatedAt dibuang — tak ada layar yang
 * baca (grep pemakaian), UI hanya pakai occurredAt.
 */
function stripTransactionSync(row: {
  id: string;
  accountId: string;
  categoryId: string;
  kind: "expense" | "income";
  title: string;
  amount: number;
  occurredAt: Date;
  note: string | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  items: {
    id: string;
    transactionId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
}) {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    kind: row.kind,
    title: row.title,
    amount: row.amount,
    occurredAt: row.occurredAt,
    note: row.note,
    locationName: row.locationName,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    items: row.items.map(stripTransactionItemSync),
  };
}

/** Akun ringkasan: kontrak UI + saldo terhitung (tanpa deletedAt/serverSeq). */
function stripAccountSummarySync(row: {
  id: string;
  name: string;
  institution: string;
  type: "bank" | "ewallet" | "cash";
  category: string;
  initialBalance: number;
  showCategory: boolean;
  createdAt: Date;
  balance: number;
}) {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    category: row.category,
    initialBalance: row.initialBalance,
    showCategory: row.showCategory,
    createdAt: row.createdAt,
    balance: row.balance,
  };
}

/** Akun detail: kontrak UI untuk prefill form (tanpa deletedAt/serverSeq). */
function stripAccountSync(row: {
  id: string;
  name: string;
  institution: string;
  type: "bank" | "ewallet" | "cash";
  category: string;
  initialBalance: number;
  showCategory: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    category: row.category,
    initialBalance: row.initialBalance,
    showCategory: row.showCategory,
    createdAt: row.createdAt,
  };
}

/** Kategori: kontrak UI (slug milik protokol pairing, bukan UI). */
function stripCategorySync(row: {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
}) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
  };
}

/** Transfer: kontrak UI (tanpa deletedAt/serverSeq). */
function stripTransferSync(row: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: row.amount,
    note: row.note,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

/** DataSource di atas klien Eden Treaty (HTTP ke API yang sama). */
export class HttpDataSource implements DataSource {
  /** Daftar transaksi satu bulan; `kind` hanya dikirim bila difilter. */
  async getMonthTransactions(month: string, kind?: TxKind) {
    const { data, error } = await api.api.transactions.get({
      query: kind ? { month, kind } : { month },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return (data ?? []).map(stripTransactionSync);
  }

  /** Transaksi satu hari `YYYY-MM-DD` (zona Asia/Jakarta) untuk layar Activity. */
  async getDayTransactions(date: string) {
    const { data, error } = await api.api.transactions.get({
      query: { date },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return (data ?? []).map(stripTransactionSync);
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
    if (!data) return data;
    return stripTransactionSync(data);
  }

  /** Ringkasan akun + saldo terhitung untuk opsi akun dan pratinjau. */
  async getAccountsSummary() {
    const { data, error } = await api.api.accounts.summary.get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    if (!data) throw new Error("Ringkasan akun kosong.");
    return {
      accounts: data.accounts.map(stripAccountSummarySync),
      totalBalance: data.totalBalance,
    };
  }

  /** Daftar kategori untuk select + resolve nama. */
  async getCategories() {
    const { data, error } = await api.api.categories.get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return (data ?? []).map(stripCategorySync);
  }

  /** Satu akun (tanpa saldo terhitung) untuk prefill form ubah. */
  async getAccount(id: string) {
    const { data, error } = await api.api.accounts({ id }).get();
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    if (!data) return data;
    return stripAccountSync(data);
  }

  /** N transfer terbaru untuk riwayat di layar Transfer. */
  async getRecentTransfers(limit = 20) {
    const { data, error } = await api.api.transfers.get({
      query: { limit: String(limit) },
    });
    if (error) throw error;
    if (isErrorBody(data)) throw data;
    return (data ?? []).map(stripTransferSync);
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
