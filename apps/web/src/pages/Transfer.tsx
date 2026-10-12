import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { cn } from "cn";
import { AmountField } from "@/components/AmountField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TransferIcon, TrashIcon } from "@/icons";
import { api, isUnauthorized } from "../lib/api";
import { formatDateTimeJakarta, formatRupiah } from "../lib/format";
import {
  fetchAccountsSummary,
  fetchRecentTransfers,
} from "../lib/queries";
import { strings } from "../strings";

const HISTORY_LIMIT = 20;

export default function Transfer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: fetchAccountsSummary,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["transfers", "recent"],
    queryFn: () => fetchRecentTransfers(HISTORY_LIMIT),
    retry: false,
  });

  const accounts = useMemo(
    () => summary.data?.accounts ?? [],
    [summary.data],
  );
  const fromAccount = accounts.find((item) => item.id === fromId) ?? null;
  const toAccount = accounts.find((item) => item.id === toId) ?? null;

  if (
    (summary.error && isUnauthorized(summary.error)) ||
    (history.error && isUnauthorized(history.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  const sameAccount = fromId !== "" && fromId === toId;
  const canSave =
    fromId !== "" && toId !== "" && !sameAccount && amount > 0 && !pending;

  const fromPreview =
    fromAccount && amount > 0
      ? {
          before: fromAccount.balance,
          after: fromAccount.balance - amount,
        }
      : null;
  const toPreview =
    toAccount && amount > 0
      ? { before: toAccount.balance, after: toAccount.balance + amount }
      : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || pending) return;
    setPending(true);
    setServerError(null);
    const trimmedNote = note.trim();
    const { error } = await api.api.transfers.post({
      fromAccountId: fromId,
      toAccountId: toId,
      amount,
      ...(trimmedNote === "" ? {} : { note: trimmedNote }),
      occurredAt: new Date().toISOString(),
    });
    setPending(false);
    if (error) {
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setServerError(strings.saveFailed);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["transfers"] });
    navigate("/wallet", { replace: true });
  }

  async function handleDelete() {
    if (deleting || deleteId === null) return;
    setDeleting(true);
    setDeleteError(false);
    const { error } = await api.api.transfers({ id: deleteId }).delete();
    setDeleting(false);
    if (error) {
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setDeleteId(null);
      setDeleteError(true);
      return;
    }
    setDeleteId(null);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["transfers"] });
  }

  function accountName(id: string): string {
    return accounts.find((item) => item.id === id)?.name ?? id;
  }

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <Link
        to="/wallet"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← {strings.backToWallet}
      </Link>
      <h1 className="mt-1 font-display text-xl font-bold">
        {strings.transferTitle}
      </h1>

      {summary.isPending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-4 flex flex-col gap-2"
        >
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : summary.isError ? (
        <Card className="mt-4">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => summary.refetch()}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-from">{strings.fromLabel}</Label>
            <Select
              value={fromId === "" ? null : fromId}
              onValueChange={(next) => setFromId(next ?? "")}
            >
              <SelectTrigger id="transfer-from" className="min-h-[44px] w-full">
                {fromAccount ? (
                  <span className="flex min-w-0 flex-1 truncate text-left">
                    {fromAccount.name} · {formatRupiah(fromAccount.balance)}
                  </span>
                ) : (
                  <SelectValue placeholder={strings.selectFromAccount} />
                )}
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {formatRupiah(account.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-to">{strings.toLabel}</Label>
            <Select
              value={toId === "" ? null : toId}
              onValueChange={(next) => setToId(next ?? "")}
            >
              <SelectTrigger id="transfer-to" className="min-h-[44px] w-full">
                {toAccount ? (
                  <span className="flex min-w-0 flex-1 truncate text-left">
                    {toAccount.name} · {formatRupiah(toAccount.balance)}
                  </span>
                ) : (
                  <SelectValue placeholder={strings.selectToAccount} />
                )}
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {formatRupiah(account.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sameAccount ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {strings.sameAccountError}
              </p>
            ) : null}
          </div>

          <AmountField
            id="transfer-amount"
            label={strings.amountLabel}
            value={amount}
            onChange={setAmount}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-note">{strings.noteLabel}</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={strings.transferNotePlaceholder}
              className="min-h-[44px]"
            />
          </div>

          {fromPreview || toPreview ? (
            <div
              aria-live="polite"
              className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2 text-sm tabular-nums"
            >
              {fromPreview && fromAccount ? (
                <p>
                  {strings.transferPreviewFrom} ({fromAccount.name}):{" "}
                  {formatRupiah(fromPreview.before)} →{" "}
                  {formatRupiah(fromPreview.after)}
                </p>
              ) : null}
              {toPreview && toAccount ? (
                <p>
                  {strings.transferPreviewTo} ({toAccount.name}):{" "}
                  {formatRupiah(toPreview.before)} →{" "}
                  {formatRupiah(toPreview.after)}
                </p>
              ) : null}
            </div>
          ) : null}

          {serverError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {serverError}
            </p>
          ) : null}

          <div className="flex gap-2 pb-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/wallet")}
              className="min-h-[44px] flex-1"
            >
              {strings.cancel}
            </Button>
            <Button
              type="submit"
              disabled={!canSave}
              className="min-h-[44px] flex-1"
            >
              {pending ? strings.saving : strings.save}
            </Button>
          </div>
        </form>
      )}

      <section aria-label={strings.transferHistoryTitle} className="mt-6">
        <h2 className="font-display text-lg font-bold">
          {strings.transferHistoryTitle}
        </h2>
        {history.isPending ? (
          <div
            aria-busy="true"
            aria-label={strings.loading}
            className="mt-2 flex flex-col gap-2"
          >
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : history.isError ? (
          <Card className="mt-2">
            <CardContent className="items-center p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {strings.loadError}
              </p>
              <Button
                type="button"
                onClick={() => history.refetch()}
                className="mt-3 min-h-[44px]"
              >
                {strings.retry}
              </Button>
            </CardContent>
          </Card>
        ) : (history.data ?? []).length === 0 ? (
          <Card className="mt-2">
            <CardContent className="items-center p-8 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <TransferIcon size={24} strokeWidth={2} />
              </span>
              <p className="text-base font-semibold">
                {strings.emptyTransfers}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {strings.emptyTransfersHint}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-2">
            <CardContent className="gap-0 p-0">
              {(history.data ?? []).map((item, index) => (
                <div
                  key={item.id}
                  className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {accountName(item.fromAccountId)} →{" "}
                      {accountName(item.toAccountId)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatDateTimeJakarta(item.occurredAt)}
                      {item.note && item.note.trim() !== ""
                        ? ` · ${item.note}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatRupiah(item.amount)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={strings.deleteButton}
                    title={strings.deleteButton}
                    onClick={() => setDeleteId(item.id)}
                    className="size-11 shrink-0"
                  >
                    <TrashIcon size={20} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {deleteError ? (
          <p role="alert" className="mt-2 text-sm font-medium text-destructive">
            {strings.deleteFailed}
          </p>
        ) : null}
      </section>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.deleteTransferTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.deleteTransferConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">
              {strings.cancel}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="min-h-[44px]">
              {deleting ? strings.deleting : strings.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
