import { createContext, useContext, type ReactNode } from "react";
import type { DataSource } from "./datasource";
import { HttpDataSource } from "./httpDataSource";

// Singleton default: HttpDataSource tanpa state, aman dipakai bersama.
const sharedHttpDataSource = new HttpDataSource();

const DataSourceContext = createContext<DataSource>(sharedHttpDataSource);

export function DataSourceProvider({
  value,
  children,
}: {
  /** Override untuk test / implementasi lain (default: singleton HTTP). */
  value?: DataSource;
  children: ReactNode;
}) {
  return (
    <DataSourceContext.Provider value={value ?? sharedHttpDataSource}>
      {children}
    </DataSourceContext.Provider>
  );
}

/** Akses DataSource aktif; seluruh layar/komponen ambil data lewat hook ini. */
export function useDataSource(): DataSource {
  return useContext(DataSourceContext);
}
