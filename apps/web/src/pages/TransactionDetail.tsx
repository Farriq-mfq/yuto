import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { cn } from "cn";
import { KindBadge, SignedAmount } from "@/components/SignedAmount";
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
import { api, errorStatus, isUnauthorized } from "../lib/api";
import { formatDateTimeJakarta, formatRupiah } from "../lib/format";
import { formatCoords, osmUrl } from "../lib/location";
import {
  fetchAccountsSummary,
  fetchCategories,
  fetchTransaction,
} from "../lib/queries";
import { strings } from "../strings";

export default function TransactionDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const tx = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => fetchTransaction(id),
    retry: false,
  });
  // 2 query paralel untuk resolve nama akun & kategori.
  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: fetchAccountsSummary,
    retry: false,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    retry: false,
  });

  if (
    (tx.error && isUnauthorized(tx.error)) ||
    (summary.error && isUnauthorized(summary.error)) ||
    (categories.error && isUnauthorized(categories.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(false);
    const { error } = await api.api.transactions({ id }).delete();
    setDeleting(false);
    if (error) {
      if (isUnauthorized(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setConfirmDelete(false);
      setDeleteError(true);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/", { replace: true });
  }

  const accountName = summary.data?.accounts.find(
    (account) => account.id === tx.data?.accountId,
  )?.name;
  const categoryName = categories.data?.find(
    (category) => category.id === tx.data?.categoryId,
  )?.name;

  const notFound =
    !tx.isPending &&
    !tx.isError &&
    tx.data == null;

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <Link
        to="/"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← {strings.backToHome}
      </Link>

      {tx.isPending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-2 flex flex-col gap-2"
        >
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : tx.isError && errorStatus(tx.error) !== 404 ? (
        <Card className="mt-2">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => tx.refetch()}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : notFound || (tx.isError && errorStatus(tx.error) === 404) ? (
        <Card className="mt-2">
          <CardContent className="items-center p-8 text-center">
            <p className="text-base font-semibold">
              {strings.transactionNotFound}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {strings.transactionNotFoundHint}
            </p>
            <Link
              to="/"
              className={cn(buttonVariants(), "mt-4 min-h-[44px]")}
            >
              {strings.backToHome}
            </Link>
          </CardContent>
        </Card>
      ) : (
        tx.data && (
          <>
            <Card className="mt-2">
              <CardContent className="items-center p-6 text-center">
                <KindBadge kind={tx.data.kind} />
                <h1 className="mt-2 font-display text-xl font-bold">
                  {tx.data.title}
                </h1>
                <SignedAmount
                  kind={tx.data.kind}
                  amount={tx.data.amount}
                  className="mt-1 text-3xl font-bold"
                />
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent>
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {strings.accountLabel}
                    </dt>
                    <dd className="text-right font-medium">
                      {summary.isPending
                        ? strings.loading
                        : (accountName ?? tx.data.accountId)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {strings.categoryLabel}
                    </dt>
                    <dd className="text-right font-medium">
                      {categories.isPending
                        ? strings.loading
                        : (categoryName ?? tx.data.categoryId)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {strings.dateLabel}
                    </dt>
                    <dd className="text-right font-medium tabular-nums">
                      {formatDateTimeJakarta(tx.data.occurredAt)}
                    </dd>
                  </div>
                  {tx.data.locationName || tx.data.address ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {strings.locationLabel}
                      </dt>
                      <dd className="text-right font-medium">
                        {tx.data.locationName ?? tx.data.address}
                      </dd>
                    </div>
                  ) : null}
                  {tx.data.latitude !== null &&
                  tx.data.latitude !== undefined &&
                  tx.data.longitude !== null &&
                  tx.data.longitude !== undefined ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {strings.locationCoordsLabel}
                      </dt>
                      <dd className="text-right font-medium tabular-nums">
                        {formatCoords(tx.data.latitude, tx.data.longitude)}{" "}
                        <a
                          href={osmUrl(tx.data.latitude, tx.data.longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {strings.openInOsm}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {strings.noteLabel}
                    </dt>
                    <dd className="text-right font-medium">
                      {tx.data.note && tx.data.note.trim() !== ""
                        ? tx.data.note
                        : strings.noNote}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {tx.data.items.length > 0 ? (
              <Card className="mt-4">
                <CardContent>
                  <h2 className="text-sm font-semibold">{strings.itemsLabel}</h2>
                  <ul className="flex flex-col">
                    {tx.data.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          {item.name}{" "}
                          <span className="text-muted-foreground tabular-nums">
                            ×{item.quantity} @ {formatRupiah(item.unitPrice)}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatRupiah(item.quantity * item.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {deleteError ? (
              <p role="alert" className="mt-4 text-sm font-medium text-destructive">
                {strings.deleteFailed}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Link
                to={`/transactions/${tx.data.id}/edit`}
                className={cn(buttonVariants(), "min-h-[44px] flex-1")}
              >
                {strings.editButton}
              </Link>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[44px] flex-1"
              >
                {strings.deleteButton}
              </Button>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.deleteTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {strings.deleteConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
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
