import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ErrorIcon,
  InfoIcon,
  RefreshIcon,
  SuccessIcon,
  TrashIcon,
  WarningIcon,
} from "@/icons";
import { isUnauthorized } from "../lib/datasource";
import { api, errorStatus } from "../lib/api";
import type { DeviceInfo } from "../../../api/src/modules/sync/service";
import type {
  PairingSituation,
  SyncClient,
  SyncResult,
} from "../lib/sync/syncEngine";
import { useSyncClient } from "../lib/sync/syncContext";
import { useSyncStatus, syncStatus } from "../lib/sync/syncStatus";
import { strings } from "../strings";

export default function Sync() {
  const client = useSyncClient();
  // why: provider sync hanya dipasang gate native — null = web
  // (mode server-langsung + kelola perangkat via cookie owner).
  if (!client) return <WebSyncView />;
  return <NativeSyncView client={client} />;
}

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // why: zona Asia/Jakarta eksplisit (aturan non-negotiable), bukan zona
  // perangkat — server dan seluruh waktu app memakai referensi ini.
  return date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

// ------------------------------------------------------------ native

function NativeSyncView({ client }: { client: SyncClient }) {
  const status = useSyncStatus();
  const [paired, setPaired] = useState<{
    serverUrl: string;
    deviceName: string;
  } | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [situation, setSituation] = useState<PairingSituation | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void client.getPairingInfo().then((info) => {
      if (!cancelled && info) {
        setPaired(info);
        setServerUrl(info.serverUrl);
        setDeviceName(info.deviceName);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  function fail(error: unknown) {
    setMessage(error instanceof Error ? error.message : strings.syncFailed);
  }

  async function runSync() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    syncStatus.setSyncing(true);
    try {
      const result = await client.syncNow();
      setLastResult(result);
      syncStatus.recordSuccess();
    } catch (error) {
      const text = error instanceof Error ? error.message : strings.syncFailed;
      setMessage(text);
      syncStatus.recordError(text);
    } finally {
      syncStatus.setSyncing(false);
      setBusy(false);
    }
  }

  async function onPair(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setLastResult(null);
    try {
      const sit = await client.pairAndDetect({ serverUrl, password, deviceName });
      setPassword("");
      const info = await client.getPairingInfo();
      if (info) setPaired(info);
      if (sit.needsChoice) {
        setSituation(sit);
      } else if (sit.serverHasData && !sit.localHasData) {
        await client.completePairingReplace();
        syncStatus.recordSuccess();
      } else {
        const result = await client.completePairingUpload();
        setLastResult(result);
        syncStatus.recordSuccess();
      }
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
      void client.getPairingInfo().then((info) => {
        if (info) setPaired(info);
      });
    }
  }

  async function onUpload() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.completePairingUpload();
      setLastResult(result);
      setSituation(null);
      syncStatus.recordSuccess();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function onReplace() {
    if (busy) return;
    if (!confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    setBusy(true);
    setMessage(null);
    try {
      await client.completePairingReplace();
      setSituation(null);
      syncStatus.recordSuccess();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function onCancelPairing() {
    if (busy) return;
    setBusy(true);
    try {
      await client.cancelPairing();
      setSituation(null);
      setPaired(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function onUnpair() {
    if (busy) return;
    if (!confirmUnpair) {
      setConfirmUnpair(true);
      return;
    }
    setConfirmUnpair(false);
    setBusy(true);
    try {
      await client.unpair();
      setPaired(null);
      setSituation(null);
      setLastResult(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const rejected = lastResult?.pushed.rejected ?? [];
  const conflicts = lastResult?.pushed.conflicts ?? [];

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
      <h1 className="font-display text-xl font-bold">{strings.syncTitle}</h1>

      <Card className="mt-5" aria-label={strings.syncTitle}>
        <CardContent>
          <p className="text-sm text-muted-foreground">{strings.syncLastAt}</p>
          <p className="mt-1 text-base font-bold" aria-live="polite">
            {status.lastSyncAt ? formatSyncTime(status.lastSyncAt) : strings.syncNever}
          </p>
          {status.lastError ? (
            <p role="alert" className="mt-2 flex items-start gap-2 text-sm font-medium text-destructive">
              <ErrorIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              {status.lastError}
            </p>
          ) : null}
          {paired ? (
            <Button
              type="button"
              onClick={runSync}
              disabled={busy || status.syncing}
              className="mt-4 min-h-[44px] w-full"
            >
              <RefreshIcon size={18} aria-hidden="true" />
              {busy || status.syncing ? strings.syncing : strings.syncNow}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {message ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}

      {rejected.length > 0 ? (
        <Card className="mt-4">
          <CardContent>
            <p className="flex items-center gap-2 text-sm font-bold">
              <WarningIcon size={18} aria-hidden="true" className="shrink-0" />
              {strings.syncRejectedTitle}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              {rejected.map((row) => (
                <li key={`${row.kind}-${row.id}`}>• {row.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <Card className="mt-4">
          <CardContent>
            <p className="flex items-center gap-2 text-sm font-bold">
              <InfoIcon size={18} aria-hidden="true" className="shrink-0" />
              {strings.syncConflictTitle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{strings.syncConflictHint}</p>
          </CardContent>
        </Card>
      ) : null}

      {situation ? (
        <Card className="mt-4">
          <CardHeader>
            <h2 className="text-base font-bold">{strings.choiceTitle}</h2>
            <CardDescription>{strings.choiceHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button type="button" onClick={onUpload} disabled={busy} className="min-h-[44px]">
              {strings.choiceUpload}
            </Button>
            <p className="-mt-1 text-xs text-muted-foreground">{strings.choiceUploadHint}</p>
            <Button
              type="button"
              variant={confirmReplace ? "destructive" : "outline"}
              onClick={onReplace}
              disabled={busy}
              className="min-h-[44px]"
            >
              <TrashIcon size={18} aria-hidden="true" />
              {confirmReplace ? strings.choiceReplaceConfirm : strings.choiceReplace}
            </Button>
            <p className="-mt-1 text-xs text-muted-foreground">{strings.choiceReplaceHint}</p>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancelPairing}
              disabled={busy}
              className="min-h-[44px]"
            >
              {strings.choiceCancel}
            </Button>
            <p className="-mt-1 text-xs text-muted-foreground">{strings.choiceCancelHint}</p>
          </CardContent>
        </Card>
      ) : null}

      {paired ? (
        <Card className="mt-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">{strings.syncPairedAs}</p>
            <p className="mt-0.5 flex items-center gap-2 text-base font-bold">
              <SuccessIcon size={18} aria-hidden="true" className="shrink-0" />
              {paired.deviceName || strings.noNote}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{strings.syncServerLabel}</p>
            <p className="break-all font-mono text-sm">{paired.serverUrl}</p>
            <p className="mt-2 text-xs text-muted-foreground">{strings.syncUnpairHint}</p>
            <Button
              type="button"
              variant={confirmUnpair ? "destructive" : "outline"}
              onClick={onUnpair}
              disabled={busy}
              className="mt-3 min-h-[44px] w-full"
            >
              {confirmUnpair ? strings.syncUnpairConfirm : strings.syncUnpair}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardHeader>
            <h2 className="text-base font-bold">{strings.pairTitle}</h2>
            <CardDescription>{strings.pairHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onPair} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="sync-server-url">{strings.serverUrlLabel}</Label>
                <Input
                  id="sync-server-url"
                  name="serverUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder={strings.serverUrlPlaceholder}
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  className="min-h-[44px] font-mono"
                />
                <p className="text-xs text-muted-foreground">{strings.serverUrlHint}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sync-password">{strings.passwordLabel}</Label>
                <Input
                  id="sync-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={strings.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sync-device-name">{strings.deviceNameLabel}</Label>
                <Input
                  id="sync-device-name"
                  name="deviceName"
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  placeholder={strings.deviceNamePlaceholder}
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <Button
                type="submit"
                disabled={busy || serverUrl.length === 0 || password.length === 0}
                className="min-h-[44px]"
              >
                {busy ? strings.pairing : strings.pairButton}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

// --------------------------------------------------------------- web

function formatDeviceTime(value: Date | string | null): string {
  if (!value) return strings.deviceNeverSeen;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return strings.deviceNeverSeen;
  return date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

/**
 * Web (browser, cookie owner): tak ada pairing — layar ini mengelola
 * registry perangkat. Endpoint devices memakai auth cookie-owner, sehingga
 * di native (tanpa cookie sesi) daftar ini SENGAJA tak ditampilkan.
 */
function WebSyncView() {
  const devices = useQuery({
    queryKey: ["sync", "devices"],
    queryFn: async (): Promise<DeviceInfo[]> => {
      const { data, error } = await api.api.sync.devices.get();
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (devices.error && isUnauthorized(devices.error)) {
    return <Navigate to="/login" replace />;
  }

  async function onRevoke(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    setPendingId(id);
    setMessage(null);
    try {
      const { error } = await api.api.sync.devices({ id }).revoke.post();
      if (error) throw error;
      await devices.refetch();
    } catch (error) {
      const status = errorStatus(error);
      setMessage(status === 429 ? strings.syncRateLimited : strings.syncFailed);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
      <h1 className="font-display text-xl font-bold">{strings.syncTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{strings.webSyncNote}</p>

      <h2 className="mt-6 text-base font-bold">{strings.devicesTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{strings.devicesHint}</p>

      {message ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}

      {devices.isPending ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {strings.loading}
        </p>
      ) : devices.isError ? (
        <Card className="mt-4">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button type="button" onClick={() => devices.refetch()} className="mt-3 min-h-[44px]">
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : devices.data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{strings.devicesEmpty}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {devices.data.map((device) => (
            <Card key={device.id}>
              <CardContent className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold">{device.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {strings.deviceLastSeen}: {formatDeviceTime(device.lastSeenAt)}
                  </span>
                  {device.revokedAt ? (
                    <span className="text-xs font-medium text-destructive">
                      {strings.deviceRevoked}
                    </span>
                  ) : null}
                </span>
                {device.revokedAt ? null : (
                  <Button
                    type="button"
                    variant={confirmId === device.id ? "destructive" : "outline"}
                    onClick={() => onRevoke(device.id)}
                    disabled={pendingId !== null}
                    className="min-h-[44px] shrink-0"
                  >
                    <TrashIcon size={18} aria-hidden="true" />
                    {pendingId === device.id
                      ? strings.revoking
                      : confirmId === device.id
                        ? strings.revokeConfirm
                        : strings.revokeButton}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
