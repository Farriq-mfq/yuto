import { useEffect, useState } from "react";
import { DataSourceProvider } from "../lib/datasourceContext";
import type { DataSource } from "../lib/datasource";
import { strings } from "../strings";

// why: modul native (plugin SQLite + SQL migrasi) diimpor DINAMIS agar
// chunk-nya hanya diunduh/dimuat di perangkat; bundle web tak membengkak
// dan tak pernah menyentuh API Capacitor.

type GateState =
  | { status: "loading" }
  | { status: "ready"; dataSource: DataSource }
  | { status: "error" };

/**
 * Gerbang database native: membuka SQLite persisten perangkat, lalu
 * menyediakan LocalDataSource ke seluruh layar. Selama dibuka tampilkan
 * splash; bila gagal tampilkan error + tombol coba lagi (tanpa login —
 * mode lokal single-owner tanpa kata sandi).
 */
export function NativeDataSourceGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    import("../lib/local/nativeFactory")
      .then((mod) => mod.createNativeDataSource())
      .then((dataSource) => {
        if (!cancelled) setState({ status: "ready", dataSource });
      })
      .catch((error) => {
        // why: pesan UI sengaja umum (tidak membocorkan detail teknis ke
        // user), tapi error asli dicatat ke console agar terlihat di
        // logcat (`adb logcat`) saat debug di perangkat.
        console.error("[yuto] native database failed to open:", error);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "ready") {
    return (
      <DataSourceProvider value={state.dataSource}>{children}</DataSourceProvider>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      {state.status === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          {strings.nativeDbLoading}
        </p>
      ) : (
        <>
          <p className="text-sm font-medium" role="alert">
            {strings.nativeDbError}
          </p>
          <p className="text-sm text-muted-foreground">{strings.nativeDbErrorHint}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-1 min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {strings.retry}
          </button>
        </>
      )}
    </div>
  );
}
