import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import {
  TransactionForm,
  type TxFormValues,
} from "@/components/TransactionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, isUnauthorized } from "../lib/api";
import { nowDateTimeLocalJakarta } from "../lib/format";
import {
  fetchAccountsSummary,
  fetchCategories,
} from "../lib/queries";
import { locationPayload } from "../lib/location";
import { strings } from "../strings";

export default function Record() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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

  const initial = useMemo(
    () => ({
      kind: "expense" as const,
      accountId: "",
      categoryId: "",
      title: "",
      amount: 0,
      occurredAtLocal: nowDateTimeLocalJakarta(),
      note: "",
      items: [],
      latitude: null,
      longitude: null,
      locationName: "",
    }),
    [],
  );

  if (
    (summary.error && isUnauthorized(summary.error)) ||
    (categories.error && isUnauthorized(categories.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(values: TxFormValues) {
    if (pending) return;
    setPending(true);
    setServerError(null);
    const { error } = await api.api.transactions.post({
      accountId: values.accountId,
      categoryId: values.categoryId,
      kind: values.kind,
      title: values.title,
      amount: values.amount,
      occurredAt: values.occurredAtIso,
      ...(values.note === "" ? {} : { note: values.note }),
      // Lokasi opsional: pin + nama; address tak dikirim terpisah.
      ...locationPayload({
        latitude: values.latitude,
        longitude: values.longitude,
        locationName: values.locationName,
      }),
      ...(values.items.length === 0 ? {} : { items: values.items }),
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
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    navigate("/", { replace: true });
  }

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <h1 className="font-display text-xl font-bold">{strings.recordTitle}</h1>

      {summary.isPending || categories.isPending ? (
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
      ) : summary.isError || categories.isError ? (
        <Card className="mt-4">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => {
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
        <TransactionForm
          initial={initial}
          accounts={summary.data.accounts}
          categories={categories.data}
          previewBase={(accountId) =>
            summary.data.accounts.find(
              (account) => account.id === accountId,
            )?.balance
          }
          pending={pending}
          serverError={serverError}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/")}
        />
      )}
    </main>
  );
}
