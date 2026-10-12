import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { id as localeId } from "react-day-picker/locale";
import { KindBadge, SignedAmount } from "@/components/SignedAmount";
import { ReceiptIcon } from "@/icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isUnauthorized } from "../lib/api";
import {
  currentMonthJakarta,
  dayKeyJakarta,
  formatDayJakarta,
  formatRupiah,
  formatTimeJakarta,
  localDateFromDatePart,
} from "../lib/format";
import {
  fetchDayTransactions,
  fetchMonthTransactions,
} from "../lib/queries";
import { strings } from "../strings";

function monthKeyOfDay(day: string): string {
  return day.slice(0, 7);
}

/**
 * Kalender aktivitas: ketuk tanggal untuk melihat expense/income/net plus
 * daftar transaksi hari itu. Bulan kalender dikontrol state `month` dan
 * disinkron dua arah (navigasi bawaan Calendar + pilihan tanggal).
 */
export default function Activity() {
  const [selected, setSelected] = useState(() => dayKeyJakarta(new Date()));
  const [month, setMonth] = useState(() => monthKeyOfDay(selected));

  const day = useQuery({
    queryKey: ["transactions", "day", selected],
    queryFn: () => fetchDayTransactions(selected),
    retry: false,
  });
  // shortcut: penanda hari bertitik memakai daftar bulan yang sudah
  // di-fetch untuk kalender; gagal dimuat = tanpa penanda (tak blokir).
  const monthTx = useQuery({
    queryKey: ["transactions", month],
    queryFn: () => fetchMonthTransactions(month),
    retry: false,
  });

  const selectedDate = localDateFromDatePart(selected);
  const monthDate = localDateFromDatePart(`${month}-01`) ?? new Date();

  const markedDays = useMemo(() => {
    const keys = new Set<string>();
    for (const row of monthTx.data ?? []) keys.add(dayKeyJakarta(row.occurredAt));
    return [...keys]
      .map((key) => localDateFromDatePart(key))
      .filter((date): date is Date => date !== undefined);
  }, [monthTx.data]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const row of day.data ?? []) {
      if (row.kind === "income") income += row.amount;
      else expense += row.amount;
    }
    return { income, expense, net: income - expense };
  }, [day.data]);

  if (
    (day.error && isUnauthorized(day.error)) ||
    (monthTx.error && isUnauthorized(monthTx.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  function handleSelect(next: Date | undefined) {
    if (!next) return;
    const key = dayKeyJakarta(next);
    setSelected(key);
    const nextMonth = monthKeyOfDay(key);
    if (nextMonth !== month) setMonth(nextMonth);
  }

  const heading = selectedDate ? formatDayJakarta(selectedDate) : selected;

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <h1 className="font-display text-xl font-bold">{strings.activityTitle}</h1>

      <Card className="mt-4">
        <CardContent className="flex justify-center p-2">
          <Calendar
            mode="single"
            locale={localeId}
            month={monthDate}
            onMonthChange={(next) => setMonth(currentMonthJakarta(next))}
            selected={selectedDate}
            onSelect={handleSelect}
            modifiers={{ hasTx: markedDays }}
            modifiersClassNames={{ hasTx: "activity-has-tx" }}
            className="[--cell-size:--spacing(11)]"
          />
        </CardContent>
      </Card>

      <section aria-label={heading} aria-live="polite" className="mt-4">
        <h2 className="px-1 text-sm font-semibold">{heading}</h2>

        {day.isPending ? (
          <div
            aria-busy="true"
            aria-label={strings.loading}
            className="mt-2 flex flex-col gap-2"
          >
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : day.isError ? (
          <Card className="mt-2">
            <CardContent className="items-center p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {strings.loadError}
              </p>
              <Button
                type="button"
                onClick={() => day.refetch()}
                className="mt-3 min-h-[44px]"
              >
                {strings.retry}
              </Button>
            </CardContent>
          </Card>
        ) : (day.data ?? []).length === 0 ? (
          <Card className="mt-2">
            <CardContent className="items-center p-8 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <ReceiptIcon size={24} strokeWidth={2} />
              </span>
              <p className="text-base font-semibold">
                {strings.emptyDayTransactions}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mt-2" aria-label={strings.activityNet}>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {strings.activityNet}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatRupiah(totals.net)}
                </p>
                <div className="mt-2 flex gap-4 text-sm tabular-nums">
                  <p>
                    <span className="text-muted-foreground">
                      {strings.monthIncome}:{" "}
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      +{formatRupiah(totals.income)}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {strings.monthExpense}:{" "}
                    </span>
                    <span className="font-semibold text-destructive">
                      -{formatRupiah(totals.expense)}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="gap-0 p-0">
                {(day.data ?? []).map((row, index) => (
                  <Link
                    key={row.id}
                    to={`/transactions/${row.id}`}
                    className={`flex min-h-[56px] items-center gap-3 px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      index > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <ReceiptIcon size={20} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {row.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {formatTimeJakarta(row.occurredAt)}
                        <KindBadge kind={row.kind} />
                      </span>
                    </span>
                    <SignedAmount
                      kind={row.kind}
                      amount={row.amount}
                      className="shrink-0 text-sm font-semibold"
                    />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </main>
  );
}
