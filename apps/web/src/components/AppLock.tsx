import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
} from "@aparajita/capacitor-biometric-auth";
import { App as CapacitorApp } from "@capacitor/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { FingerprintIcon, LoaderIcon, LockIcon } from "@/icons";
import { shouldRelock } from "../lib/native/lockPolicy";
import { strings } from "../strings";

// why: modul ini dimuat DINAMIS dari main.tsx dan HANYA di-render bila
// Capacitor.isNativePlatform() — import statis plugin native di sini masuk
// chunk terpisah yang tak pernah diunduh/dieksekusi di web.

type Capability = { canBiometric: boolean; canDeviceCredential: boolean };

type LockState =
  | { status: "checking" }
  | {
      status: "locked";
      capability: Capability;
      authenticating: boolean;
      error: string | null;
    }
  | { status: "blocked"; checking: boolean }
  | { status: "unlocked" };

/**
 * Gerbang kunci aplikasi (native saja): menutupi SELURUH UI sampai user lolos
 * autentikasi perangkat — biometrik (sidik jari/wajah) ATAU kredensial
 * perangkat (PIN/pola/kata sandi) via `allowDeviceCredential`.
 *
 * Keputusan yang didokumentasikan:
 * - Tak ada biometrik DAN tak ada kunci layar → state "blocked": aplikasi
 *   MENOLAK berjalan (fail-closed) dengan instruksi mengatur kunci layar.
 *   Yuto tak pernah diam-diam berjalan tanpa kunci.
 * - Kunci ulang setelah APP_LOCK_TIMEOUT_MS di background (@capacitor/app
 *   `appStateChange`). Kunci menutup UI; koneksi DB tetap terbuka di memori
 *   (enkripsi SQLCipher melindungi file saat rest, bukan RAM) — tradeoff
 *   deliberate agar kunci-ulang instan tanpa migrasi ulang.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LockState>({ status: "checking" });
  const backgroundedAtRef = useRef<number | null>(null);
  const autoTriedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshCapability = useCallback(async (): Promise<Capability | null> => {
    try {
      const info = await BiometricAuth.checkBiometry();
      // why: di Android biometryType tak bisa diandalkan (hardware face
      // unlock kadang hanya untuk buka-kunci perangkat, bukan aplikasi) —
      // hanya isAvailable/deviceIsSecure yang dipakai sebagai sakelar.
      const capability: Capability = {
        canBiometric: info.isAvailable,
        canDeviceCredential: info.deviceIsSecure,
      };
      if (!capability.canBiometric && !capability.canDeviceCredential) {
        setState({ status: "blocked", checking: false });
        return null;
      }
      return capability;
    } catch {
      // why: checkBiometry gagal (plugin rusak?) = tak ada bukti kunci bisa
      // dipakai → fail-closed ke blocked, bukan unlocked.
      setState({ status: "blocked", checking: false });
      return null;
    }
  }, []);

  const unlockFromLocked = useCallback(
    async (
      locked: Extract<LockState, { status: "locked" }>,
    ): Promise<void> => {
      setState({ ...locked, authenticating: true, error: null });
      try {
        await BiometricAuth.authenticate({
          reason: strings.lockSubtitle,
          cancelTitle: strings.cancel,
          allowDeviceCredential: true,
          androidTitle: strings.lockTitle,
          androidSubtitle: strings.lockSubtitle,
        });
        setState({ status: "unlocked" });
      } catch (error) {
        if (
          error instanceof BiometryError &&
          (error.code === BiometryErrorType.userCancel ||
            error.code === BiometryErrorType.systemCancel ||
            error.code === BiometryErrorType.appCancel)
        ) {
          // why: batal oleh user/sistem bukan kegagalan — kembali diam ke
          // layar kunci tanpa pesan error.
          setState({ ...locked, authenticating: false, error: null });
          return;
        }
        let message: string = strings.lockAuthFailed;
        if (
          error instanceof BiometryError &&
          (error.code === BiometryErrorType.biometryLockout ||
            error.code === BiometryErrorType.authenticationFailed)
        ) {
          // why: auth gagal beruntun membuat sistem mengunci biometrik
          // sementara; pesan khusus agar user menunggu, bukan mengetuk terus.
          message = strings.lockTooManyAttempts;
        }
        if (
          error instanceof BiometryError &&
          (error.code === BiometryErrorType.passcodeNotSet ||
            error.code === BiometryErrorType.noDeviceCredential ||
            error.code === BiometryErrorType.biometryNotAvailable)
        ) {
          // why: kapabilitas bisa berubah selagi background (user mematikan
          // kunci layar) → cek ulang; bila habis ya blocked.
          const capability = await refreshCapability();
          if (!capability) return;
        }
        const latest = stateRef.current;
        if (latest.status === "locked") {
          setState({ ...latest, authenticating: false, error: message });
        }
      }
    },
    [refreshCapability],
  );

  const unlock = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "unlocked") return Promise.resolve();
    if (current.status === "blocked") {
      setState({ status: "blocked", checking: true });
      return refreshCapability().then((capability) => {
        setState(
          capability
            ? {
                status: "locked",
                capability,
                authenticating: false,
                error: null,
              }
            : { status: "blocked", checking: false },
        );
      });
    }
    if (current.status !== "locked" || current.authenticating) {
      return Promise.resolve();
    }
    return unlockFromLocked(current);
  }, [refreshCapability, unlockFromLocked]);

  const unlockRef = useRef(unlock);
  unlockRef.current = unlock;
  const unlockFromLockedRef = useRef(unlockFromLocked);
  unlockFromLockedRef.current = unlockFromLocked;

  // Pemeriksaan kapabilitas awal + satu kali auto-prompt saat dibuka.
  useEffect(() => {
    let cancelled = false;
    refreshCapability().then((capability) => {
      if (cancelled || !capability) return;
      const locked: Extract<LockState, { status: "locked" }> = {
        status: "locked",
        capability,
        authenticating: false,
        error: null,
      };
      setState(locked);
      if (!autoTriedRef.current) {
        autoTriedRef.current = true;
        // why: auto-prompt sekali agar buka-kunci satu ketuk (atau nol);
        // batal → user mengetuk tombol "Buka kunci" manual. State locked
        // dioper langsung (bukan via ref) karena ref belum ter-update.
        void unlockFromLockedRef.current(locked);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kunci ulang setelah timeout background.
  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        if (
          stateRef.current.status === "unlocked" &&
          shouldRelock(backgroundedAtRef.current, Date.now())
        ) {
          void refreshCapability().then((capability) => {
            if (!capability) return;
            setState({
              status: "locked",
              capability,
              authenticating: false,
              error: null,
            });
          });
        }
        backgroundedAtRef.current = null;
      } else {
        backgroundedAtRef.current = Date.now();
      }
    }).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, [refreshCapability]);

  if (state.status === "unlocked") return <>{children}</>;

  // why: fail-closed — selama status kunci/belum jelas, SELURUH UI tertutup
  // overlay penuh (tak ada konten bocor di bawahnya).
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {state.status === "checking" ? (
        <>
          <LoaderIcon
            size={40}
            aria-hidden="true"
            className="animate-spin text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground" role="status">
            {strings.lockChecking}
          </p>
        </>
      ) : state.status === "blocked" ? (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-muted">
            <LockIcon size={32} aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold">
            {strings.lockNoCredentialTitle}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground" role="alert">
            {strings.lockNoCredentialHint}
          </p>
          <button
            type="button"
            disabled={state.checking}
            onClick={() => void unlock()}
            className="min-h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {strings.retry}
          </button>
        </>
      ) : (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-muted">
            {state.capability.canBiometric ? (
              <FingerprintIcon size={32} aria-hidden="true" />
            ) : (
              <LockIcon size={32} aria-hidden="true" />
            )}
          </span>
          <h1 className="text-lg font-semibold">{strings.lockTitle}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {strings.lockSubtitle}
          </p>
          {state.error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={state.authenticating}
            onClick={() => void unlock()}
            aria-label={strings.lockUnlockButton}
            className="min-h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {state.authenticating ? strings.lockChecking : strings.lockUnlockButton}
          </button>
        </>
      )}
    </div>
  );
}
