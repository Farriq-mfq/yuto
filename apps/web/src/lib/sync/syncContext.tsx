import { createContext, useContext, type ReactNode } from "react";
import type { SyncClient } from "./syncEngine";

// Klien sync untuk UI native: dibuat sekali oleh NativeDataSourceGate
// (butuh LocalDataSource yang sudah terbuka) dan dikonsumsi layar /sync.
// Di web nilainya null (mode server-langsung + kelola perangkat).

const SyncClientContext = createContext<SyncClient | null>(null);

export function SyncClientProvider({
  value,
  children,
}: {
  value: SyncClient;
  children: ReactNode;
}) {
  return (
    <SyncClientContext.Provider value={value}>
      {children}
    </SyncClientContext.Provider>
  );
}

/** Klien sync aktif, atau null di web / sebelum database siap. */
export function useSyncClient(): SyncClient | null {
  return useContext(SyncClientContext);
}
