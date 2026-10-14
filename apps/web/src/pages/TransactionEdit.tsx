import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  TransactionForm,
  type TxFormValues,
} from "@/components/TransactionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorStatus, isUnauthorized } from "../lib/datasource";
import { useDataSource } from "../lib/datasourceContext";
import { toDateTimeLocalJakarta } from "../lib/format";
import { balanceBeforeTx } from "../lib/preview";
import { strings } from "../strings";

export default function TransactionEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const tx = useQuery({
    queryKey: ["transactions", id],
    queryFn: () => dataSource.getTransaction(id),
    retry: false,
  });
  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: () => dataSource.getAccountsSummary(),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => dataSource.getCategories(),
    retry: false,
  });

  const initial = useMemo(() => {
    if (!tx.data) return null;
    return {
      kind: tx.data.kind,
      accountId: tx.data.accountId,
      categoryId: tx.data.categoryId,
      title: tx.data.title,
      amount: tx.data.amount,
      occurredAtLocal: toDateTimeLocalJakarta(tx.data.occurredAt),
      note: tx.data.note ?? "",
      latitude: tx.data.latitude ?? null,
      longitude: tx.data.longitude ?? null,
      locationName: tx.data.locationName ?? "",
      items: tx.data.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };
  }, [tx.data]);

  if (
    (tx.error && isUnauthorized(tx.error)) ||
    (summary.error && isUnauthorized(summary.error)) ||
    (categories.error && isUnauthorized(categories.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(values: TxFormValues) {
    if (pending || !tx.data || !initial) return;
    setPending(true);
    setServerError(null);
    const original = tx.data;
    try {
      await dataSource.updateTransaction(id, {
        kind: values.kind,
        accountId: values.accountId,
        // Jangan kirim categoryId bila user tidak menyentuhnya agar kategori
        // tak berubah diam-diam (PRD acceptance 6).
        ...(values.categoryId !== original.categoryId
          ? { categoryId: values.categoryId }
          : {}),
        title: values.title,
        amount: values.amount,
        ...(new Date(values.occurredAtIso).getTime() !==
        new Date(original.occurredAt).getTime()
          ? { occurredAt: values.occurredAtIso }
          : {}),
        ...((values.note || "") !== (original.note ?? "")
          ? { note: values.note }
          : {}),
        // Lokasi: kirim hanya field yang berubah (tanpa address terpisah).
        // Toggle mati = nilai form null = lokasi server dibiarkan apa adanya.
        ...((values.latitude ?? null) !== (original.latitude ?? null) ||
        (values.longitude ?? null) !== (original.longitude ?? null)
          ? values.latitude !== null && values.longitude !== null
            ? { latitude: values.latitude, longitude: values.longitude }
            : {}
          : {}),
        ...((values.locationName || "") !== (original.locationName ?? "")
          ? { locationName: values.locationName }
          : {}),
        // Server replace semantics: selalu kirim daftar final (kosong = hapus).
        items: values.items,
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
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate(`/transactions/${id}`, { replace: true });
  }

  const loading = tx.isPending || summary.isPending || categories.isPending;
  const loadError = tx.isError || summary.isError || categories.isError;
  const txGone =
    !tx.isPending &&
    (errorStatus(tx.error) === 404 || (!tx.isError && tx.data == null));

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
      <Link
        to={`/transactions/${id}`}
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← {strings.detailTitle}
      </Link>
      <h1 className="mt-2 font-display text-xl font-bold">
        {strings.editTitle}
      </h1>

      {loading ? (
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
      ) : txGone ? (
        <Card className="mt-5">
          <CardContent className="items-center p-8 text-center">
            <p className="text-base font-semibold">
              {strings.transactionNotFound}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {strings.transactionNotFoundHint}
            </p>
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="mt-5">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => {
                void tx.refetch();
                void summary.refetch();
                void categories.refetch();
              }}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        initial &&
        tx.data && (
          <TransactionForm
            key={tx.data.id}
            initial={initial}
            accounts={summary.data?.accounts ?? []}
            categories={categories.data ?? []}
            previewBase={(accountId) => {
              const balance = summary.data?.accounts.find(
                (account) => account.id === accountId,
              )?.balance;
              if (balance === undefined) return undefined;
              // Pratinjau dihitung dari saldo sebelum transaksi ini:
              // keluarkan dulu efeknya bila akun tak diganti.
              return accountId === tx.data?.accountId
                ? balanceBeforeTx({
                    currentBalance: balance,
                    txKind: tx.data.kind,
                    txAmount: tx.data.amount,
                  })
                : balance;
            }}
            pending={pending}
            serverError={serverError}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/transactions/${id}`)}
          />
        )
      )}
    </main>
  );
}
