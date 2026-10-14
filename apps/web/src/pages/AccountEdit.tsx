import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { cn } from "cn";
import { AccountForm, type AccountFormValues } from "@/components/AccountForm";
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
import { Skeleton } from "@/components/ui/skeleton";
import { errorStatus, isUnauthorized } from "../lib/datasource";
import { useDataSource } from "../lib/datasourceContext";
import { formatRupiah } from "../lib/format";
import { useHideBalance } from "../lib/hideBalance";
import { type AccountType } from "../lib/datasource";
import { strings } from "../strings";

function asAccountType(type: string): AccountType {
  return type === "ewallet" || type === "cash" ? type : "bank";
}

export default function AccountEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const [hidden] = useHideBalance();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const account = useQuery({
    queryKey: ["accounts", id],
    queryFn: () => dataSource.getAccount(id),
    retry: false,
  });
  // Saldo kini terhitung untuk info saja (preferensi sembunyi ikut Wallet).
  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: () => dataSource.getAccountsSummary(),
    retry: false,
  });

  const initial = useMemo(
    () =>
      account.data
        ? {
            type: asAccountType(account.data.type),
            institution: account.data.institution,
            // Nama kustom hanya prefill bila beda dari institusi.
            name:
              account.data.name === account.data.institution
                ? ""
                : account.data.name,
            category: account.data.category,
            initialBalance: account.data.initialBalance,
            showCategory: account.data.showCategory,
          }
        : null,
    [account.data],
  );
  const balance = summary.data?.accounts.find((item) => item.id === id)
    ?.balance;

  if (
    (account.error && isUnauthorized(account.error)) ||
    (summary.error && isUnauthorized(summary.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(values: AccountFormValues) {
    if (pending || !account.data) return;
    setPending(true);
    setServerError(null);
    try {
      await dataSource.updateAccount(id, {
        name: values.name,
        institution: values.institution,
        type: values.type,
        category: values.category,
        initialBalance: values.initialBalance,
        showCategory: values.showCategory,
      });
    } catch (error) {
      setPending(false);
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setServerError(strings.saveFailed);
      return;
    }
    setPending(false);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/wallet", { replace: true });
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await dataSource.deleteAccount(id);
    } catch (error) {
      setDeleting(false);
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      // 409 = akun masih dipakai transaksi/transfer: tampilkan pesan,
      // jangan crash, dialog tetap bisa ditutup.
      if (errorStatus(error) === 409) {
        setDeleteError(strings.deleteAccountConflict);
        return;
      }
      setDeleteError(strings.deleteFailed);
      return;
    }
    setDeleting(false);
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/wallet", { replace: true });
  }

  const gone =
    !account.isPending &&
    (errorStatus(account.error) === 404 || (!account.isError && !account.data));

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
      <Link
        to="/wallet"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← {strings.backToWallet}
      </Link>
      <h1 className="mt-2 font-display text-xl font-bold">
        {strings.editAccountTitle}
      </h1>

      {account.isPending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-5 flex flex-col gap-3"
        >
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : gone ? (
        <Card className="mt-5">
          <CardContent className="items-center p-8 text-center">
            <p className="text-base font-semibold">{strings.accountNotFound}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {strings.accountNotFoundHint}
            </p>
            <Link
              to="/wallet"
              className={cn(buttonVariants(), "mt-4 min-h-[44px]")}
            >
              {strings.backToWallet}
            </Link>
          </CardContent>
        </Card>
      ) : account.isError ? (
        <Card className="mt-5">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => {
                void account.refetch();
                void summary.refetch();
              }}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        initial && (
          <>
            {balance !== undefined ? (
              <p
                aria-live="polite"
                className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm tabular-nums"
              >
                {strings.currentBalance}:{" "}
                {hidden ? strings.balanceHidden : formatRupiah(balance)}
              </p>
            ) : null}
            <AccountForm
              key={account.data?.id}
              initial={initial}
              pending={pending}
              serverError={serverError}
              onSubmit={handleSubmit}
              onCancel={() => navigate("/wallet")}
            />

            <div className="mt-5 flex flex-col gap-3">
              {deleteError ? (
                <p
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {deleteError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[44px] w-full"
              >
                {strings.deleteButton}
              </Button>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {strings.deleteAccountTitle}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {strings.deleteAccountConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError ? (
                  <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                  >
                    {deleteError}
                  </p>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-[44px]">
                    {strings.cancel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="min-h-[44px]"
                  >
                    {deleting ? strings.deleting : strings.confirmDelete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )
      )}
    </main>
  );
}
