import { useEffect, useRef, useState } from "react";
import { DataSourceProvider } from "../lib/datasourceContext";
import type { DataSource } from "../lib/datasource";
import { SyncClientProvider } from "../lib/sync/syncContext";
import type { SyncClient } from "../lib/sync/syncEngine";
import { strings } from "../strings";

// why: modul native (plugin SQLite + SQL migrasi) diimpor DINAMIS agar
// chunk-nya hanya diunduh/dimuat di perangkat; bundle web tak membengkak
// dan tak pernah menyentuh API Capacitor.

type GateState =
  | { status: "loading" }
  | { status: "ready"; dataSource: DataSource; syncClient: SyncClient }
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
  // why: satu auto-retry diam-diam sebelum menyerah ke layar error —
  // kegagalan buka DB transient (proses dibunuh battery-saver saat migrasi,
  // reload WebView pasca renderer-crash dengan koneksi native setengah
  // terbuka) pulih di percobaan kedua. Tanpa ini user terjebak di layar
  // error TANPA tab bar ("tidak bisa sentuh menu lain"). Manual "Coba
  // lagi" tetap ada untuk kegagalan persisten.
  const autoRetried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    import("../lib/local/nativeFactory")
      .then((mod) => mod.createNativeDataSource())
      .then(async (dataSource) => {
        if (cancelled) return;
        // why: klien sync dibuat di sini lalu disediakan via
        // SyncClientProvider agar layar /sync memakai NativeSyncView
        // (pairing + sync perangkat). Tanpa ini useSyncClient() null →
        // jatuh ke WebSyncView yang memanggil /api/sync/devices tanpa
        // backend lokal → `e.data.map` crash → halaman blank.
        const { createSyncClient } = await import("../lib/sync/syncEngine");
        const { HttpSyncTransport } = await import("../lib/sync/syncTransport");
        const { createTokenStore } = await import("../lib/sync/tokenStore");
        const tokens = createTokenStore({ native: true });
        const transport = new HttpSyncTransport();
        const syncClient = createSyncClient({
          ds: dataSource,
          transport,
          tokens,
        });
        if (!cancelled) setState({ status: "ready", dataSource, syncClient });
      })
      .catch((error) => {
        // why: pesan UI sengaja umum (tidak membocorkan detail teknis ke
        // user), tapi error asli dicatat ke console agar terlihat di
        // logcat (`adb logcat`) saat debug di perangkat. WAJIB string
        // (message/stack), bukan objek — console Capacitor me-render objek
        // sebagai "[object Object]" yang tak berguna.
        const detail =
          error instanceof Error
            ? (error.stack ?? error.message)
            : JSON.stringify(error);
        console.error(`[yuto] native database failed to open: ${detail}`);
        if (cancelled) return;
        if (!autoRetried.current) {
          autoRetried.current = true;
          setAttempt((n) => n + 1);
          return;
        }
        setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "ready") {
    return (
      <DataSourceProvider value={state.dataSource}>
        <SyncClientProvider value={state.syncClient}>{children}</SyncClientProvider>
      </DataSourceProvider>
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
