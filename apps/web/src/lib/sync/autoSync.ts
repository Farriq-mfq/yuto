import type {
  CreateAccountInput,
  CreateTransactionInput,
  CreateTransferInput,
  DataSource,
  TxKind,
  UpdateAccountInput,
  UpdateTransactionInput,
} from "../datasource";
import { scheduleSyncAfterWrite } from "./syncStatus";

// Dekorator DataSource: setiap tulis yang sukses menjadwalkan sync otomatis
// (debounce). Dipasang SEKALI di gate native (lihat NativeDataSourceGate) —
// layar tak berubah (tak ada call-site yang disentuh).

/** Tulis lokal lalu jadwalkan sync; baca diteruskan apa adanya. */
export class AutoSyncDataSource implements DataSource {
  constructor(private readonly inner: DataSource) {}

  private afterWrite<T>(work: Promise<T>): Promise<T> {
    return work.then(
      (value) => {
        scheduleSyncAfterWrite();
        return value;
      },
      (error: unknown) => {
        throw error;
      },
    );
  }

  getMonthTransactions(month: string, kind?: TxKind) {
    return this.inner.getMonthTransactions(month, kind);
  }

  getDayTransactions(date: string) {
    return this.inner.getDayTransactions(date);
  }

  getTransaction(id: string) {
    return this.inner.getTransaction(id);
  }

  getAccountsSummary() {
    return this.inner.getAccountsSummary();
  }

  getAccount(id: string) {
    return this.inner.getAccount(id);
  }

  getCategories() {
    return this.inner.getCategories();
  }

  getRecentTransfers(limit?: number) {
    return this.inner.getRecentTransfers(limit);
  }

  getReportSummary(month: string) {
    return this.inner.getReportSummary(month);
  }

  getReportCategories(month: string, kind: TxKind) {
    return this.inner.getReportCategories(month, kind);
  }

  getAppConfig() {
    return this.inner.getAppConfig();
  }

  login(password: string): Promise<void> {
    return this.inner.login(password);
  }

  createAccount(input: CreateAccountInput): Promise<void> {
    return this.afterWrite(this.inner.createAccount(input));
  }

  updateAccount(id: string, input: UpdateAccountInput): Promise<void> {
    return this.afterWrite(this.inner.updateAccount(id, input));
  }

  deleteAccount(id: string): Promise<void> {
    return this.afterWrite(this.inner.deleteAccount(id));
  }

  createTransaction(input: CreateTransactionInput): Promise<void> {
    return this.afterWrite(this.inner.createTransaction(input));
  }

  updateTransaction(id: string, input: UpdateTransactionInput): Promise<void> {
    return this.afterWrite(this.inner.updateTransaction(id, input));
  }

  deleteTransaction(id: string): Promise<void> {
    return this.afterWrite(this.inner.deleteTransaction(id));
  }

  createTransfer(input: CreateTransferInput): Promise<void> {
    return this.afterWrite(this.inner.createTransfer(input));
  }

  deleteTransfer(id: string): Promise<void> {
    return this.afterWrite(this.inner.deleteTransfer(id));
  }
}
