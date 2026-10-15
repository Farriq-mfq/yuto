import { useMemo } from "react";
import { NativeSyncView } from "./Sync";
import type {
  PairingSituation,
  SyncClient,
  SyncResult,
} from "../lib/sync/syncEngine";

// Pratinjau DEV-ONLY untuk NativeSyncView (UI pairing + tombol Batal +
// kartu pilihan) di browser desktop. Native asli memakai LocalDataSource +
// secure storage; di sini client dipalsukan agar alur UI bisa diklik dan
// diamati tanpa perangkat. TIDAK PERNAH dirender di production (lihat
// main.tsx: route hanya dipasang saat import.meta.env.DEV).

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Dibatalkan."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Dibatalkan."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const fakeResult: SyncResult = {
  pushed: {
    applied: { accounts: 1, transactions: 2, transfers: 0 },
    rejected: [],
    conflicts: [],
  },
  pulled: { accounts: 0, transactions: 0, transfers: 0, categories: 0, cursor: 7 },
};

export default function DebugSync() {
  const client = useMemo<SyncClient>(
    () => ({
      syncNow: async (signal?: AbortSignal) => {
        await delay(800, signal);
        return fakeResult;
      },
      pairAndDetect: async (
        _input: { serverUrl: string; password: string; deviceName: string },
        signal?: AbortSignal,
      ): Promise<PairingSituation> => {
        await delay(800, signal);
        // why: simulasi kedua sisi punya data → kartu 3 pilihan muncul,
        // jalur yang paling sering disentuh saat testing pairing.
        return {
          baseUrl: "https://contoh.local:3000",
          token: "dbg-token",
          deviceId: "dbg-device",
          localHasData: true,
          serverHasData: true,
          needsChoice: true,
        };
      },
      completePairingUpload: async (signal?: AbortSignal) => {
        await delay(800, signal);
        return fakeResult;
      },
      completePairingReplace: async (signal?: AbortSignal) => {
        await delay(800, signal);
        return {
          accounts: 3,
          transactions: 5,
          transfers: 0,
          categories: 13,
          cursor: 42,
        };
      },
      pushOnly: async (signal?: AbortSignal) => {
        await delay(800, signal);
        return fakeResult.pushed;
      },
      cancelPairing: async () => {
        await delay(200);
      },
      unpair: async () => {
        await delay(200);
      },
      getConnection: async () => ({ baseUrl: "", token: "" }),
      getPairingInfo: async () => null,
    }),
    [],
  );
  return <NativeSyncView client={client} />;
}
