import { useEffect, useState } from "react";
import { DataSourceProvider } from "../lib/datasourceContext";
import type { DataSource } from "../lib/datasource";
import { AutoSyncDataSource } from "../lib/sync/autoSync";
import { createSyncClient } from "../lib/sync/syncEngine";
import { HttpSyncTransport } from "../lib/sync/syncTransport";
import { loadSyncEnabled, canSync } from "../lib/sync/syncPrefs";
import { createTokenStore } from "../lib/sync/tokenStore";
import {
  cancelScheduledSync,
  initSyncRunner,
  syncStatus,
} from "../lib/sync/syncStatus";
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
      .then(async (mod) => {
        const local = await mod.createNativeDataSource();
        if (cancelled) return;
        const tokens = createTokenStore({ native: true });
        const transport = new HttpSyncTransport();
        const client = createSyncClient({ ds: local, transport, tokens });
        // why: sync guard terpusat di sini (bukan di engine): tanpa token,
        // switch mati, URL tak valid, atau offline → tak ada request sync
        // sama sekali, dan syncNow tak pernah melempar NOT_PAIRED ke status.
        const shouldSync = async (): Promise<boolean> => {
          const [enabled, serverUrl, token] = await Promise.all([
            loadSyncEnabled(),
            tokens.loadServerUrl(),
            tokens.loadToken(),
          ]);
          return (
            token !== null &&
            canSync({
              enabled,
              serverUrl: serverUrl ?? "",
              online:
                typeof navigator === "undefined" ? true : navigator.onLine,
            })
          );
        };
        const runScheduledSync = async (): Promise<void> => {
          try {
            syncStatus.setSyncing(true);
            await client.syncNow();
            syncStatus.recordSuccess();
          } catch (error) {
            syncStatus.recordError(
              error instanceof Error ? error.message : String(error),
            );
          } finally {
            syncStatus.setSyncing(false);
          }
        };
        initSyncRunner(runScheduledSync);
        const wrapped = new AutoSyncDataSource(local, shouldSync);
        if (!cancelled) {
          setState({ status: "ready", dataSource: wrapped });
          // why: sync saat dibuka (bukan hanya pasca-tulis); fire-and-forget
          // agar UI tak diblokir, guard di dalam shouldSync.
          void shouldSync().then((ok) => {
            if (ok && !cancelled) void runScheduledSync();
          });
        }
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
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
      cancelScheduledSync();
      initSyncRunner(null);
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
