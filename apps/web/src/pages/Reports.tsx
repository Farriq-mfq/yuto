import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { SignedAmount } from "@/components/SignedAmount";
import { ChevronRightIcon, ReceiptIcon } from "@/icons";
import { ReportCharts } from "@/components/ReportCharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isUnauthorized } from "../lib/api";
import {
  currentMonthJakarta,
  formatPercent,
  formatRupiah,
  formatTimeJakarta,
} from "../lib/format";
import {
  fetchMonthTransactions,
  fetchReportCategories,
  fetchReportSummary,
  type ReportCategory,
  type TxKind,
} from "../lib/queries";
import { strings } from "../strings";

/** Teks perubahan vs bulan lalu: selalu bertanda +/- plus kata naik/turun. */
function changeLabel(category: ReportCategory): string {
  if (category.change > 0) {
    return `+${formatRupiah(category.change)} ${strings.reportsUp} ${strings.reportsVsLastMonth}`;
  }
  if (category.change < 0) {
    return `-${formatRupiah(Math.abs(category.change))} ${strings.reportsDown} ${strings.reportsVsLastMonth}`;
  }
  return strings.reportsFlat;
}

/**
 * Laporan per kategori: pemilih bulan, switch Keluar/Masuk, kartu ringkasan,
 * lalu baris kategori (total + persen + change vs bulan lalu). Ketuk baris
 * untuk melihat daftar transaksi kategori itu bulan itu, inline.
 */
export default function Reports() {
  // why: banner Home menautkan bulan yang sedang dilihat (?month=);
  // nilai tak valid diabaikan demi bulan berjalan.
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const query = searchParams.get("month") ?? "";
    return /^(\d{4})-(0[1-9]|1[0-2])$/.test(query)
      ? query
      : currentMonthJakarta();
  });
  const [kind, setKind] = useState<TxKind>("expense");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // why: id kategori yang dibuka adalah UI state; daftar transaksi milik
  // server tetap di cache query, tak disalin ke state.
  useEffect(() => {
    setExpandedId(null);
  }, [month, kind]);

  const summary = useQuery({
    queryKey: ["reports", "summary", month],
    queryFn: () => fetchReportSummary(month),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ["reports", "categories", month, kind],
    queryFn: () => fetchReportCategories(month, kind),
    retry: false,
  });
  // why: daftar transaksi kategori diambil dari endpoint yang sama seperti
  // Home lalu difilter client, tanpa route baru.
  const detail = useQuery({
    queryKey: ["transactions", month, kind],
    queryFn: () => fetchMonthTransactions(month, kind),
    enabled: expandedId !== null,
    retry: false,
  });

  if (
    (summary.error && isUnauthorized(summary.error)) ||
    (categories.error && isUnauthorized(categories.error)) ||
    (detail.error && isUnauthorized(detail.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  const pending = summary.isPending || categories.isPending;
  const queryError = summary.error ?? categories.error;
  const report = summary.data;
  const rows = categories.data;

  function refetch() {
    void summary.refetch();
    void categories.refetch();
  }

  const expandedRows = (detail.data ?? []).filter(
    (row) => row.categoryId === expandedId,
  );

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <h1 className="font-display text-xl font-bold">{strings.reportsTitle}</h1>
        <Input
          type="month"
          aria-label={strings.monthLabel}
          value={month}
          onChange={(event) => {
            if (event.target.value !== "") setMonth(event.target.value);
          }}
          className="min-h-[44px] w-[170px]"
        />
      </div>

      <Tabs
        value={kind}
        onValueChange={(next) => setKind(next as TxKind)}
        className="mt-4"
      >
        <TabsList aria-label={strings.reportsKindLabel} className="h-auto w-full">
          <TabsTrigger value="expense" className="min-h-[44px] flex-1">
            {strings.filterExpense}
          </TabsTrigger>
          <TabsTrigger value="income" className="min-h-[44px] flex-1">
            {strings.filterIncome}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {pending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-4 flex flex-col gap-2"
        >
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : queryError || !report || !rows ? (
        <Card className="mt-4">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={refetch}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-4" aria-label={strings.netThisMonth}>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {strings.netThisMonth}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {formatRupiah(report.net)}
              </p>
              <div className="mt-3 flex gap-4 text-sm tabular-nums">
                <p>
                  <span className="text-muted-foreground">
                    {strings.monthIncome}:{" "}
                  </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    +{formatRupiah(report.income)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">
                    {strings.monthExpense}:{" "}
                  </span>
                  <span className="font-semibold text-destructive">
                    -{formatRupiah(report.expense)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {rows.length === 0 ? (
            <Card className="mt-4">
              <CardContent className="items-center p-8 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <ReceiptIcon size={24} strokeWidth={2} />
                </span>
                <p className="text-base font-semibold">{strings.reportsEmpty}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {strings.reportsEmptyHint}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
            {/* why: chart hanya suplemen dari data yang sama; daftar baris
                berlabel + persen + SignedAmount di bawah tetap utama. */}
            <ReportCharts
              rows={rows}
              total={kind === "income" ? report.income : report.expense}
              kind={kind}
            />
            <Card className="mt-4">
              <CardContent className="gap-0 p-0">
                {rows.map((category, index) => {
                  const expanded = expandedId === category.categoryId;
                  return (
                    <div
                      key={category.categoryId}
                      className={index > 0 ? "border-t border-border" : ""}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`report-tx-${category.categoryId}`}
                        onClick={() =>
                          setExpandedId((previous) =>
                            previous === category.categoryId
                              ? null
                              : category.categoryId,
                          )
                        }
                        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        >
                          <ReceiptIcon size={20} strokeWidth={2} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              // why: warna dot adalah data milik user dari DB
                              // (bukan token desain), jadi dipakai inline.
                              style={{ backgroundColor: category.color }}
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                            />
                            <span className="truncate text-sm font-medium">
                              {category.name}
                            </span>
                          </span>
                          <span className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                            {changeLabel(category)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <SignedAmount
                            kind={kind}
                            amount={category.total}
                            className="text-sm font-semibold"
                          />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatPercent(category.percent)}
                          </span>
                        </span>
                        <ChevronRightIcon
                          size={20}
                          aria-hidden="true"
                          className={`shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                      </button>
                      {expanded && (
                        <div
                          id={`report-tx-${category.categoryId}`}
                          className="border-t border-border bg-muted/40"
                        >
                          {detail.isPending ? (
                            <div
                              aria-busy="true"
                              aria-label={strings.loading}
                              className="flex flex-col gap-2 p-4"
                            >
                              <Skeleton className="h-12 rounded-xl" />
                              <Skeleton className="h-12 rounded-xl" />
                            </div>
                          ) : detail.error ? (
                            <div className="p-4 text-center">
                              <p className="text-sm text-muted-foreground">
                                {strings.loadError}
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => detail.refetch()}
                                className="mt-2 min-h-[44px]"
                              >
                                {strings.retry}
                              </Button>
                            </div>
                          ) : expandedRows.length === 0 ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                              {strings.reportsEmpty}
                            </p>
                          ) : (
                            expandedRows.map((row) => (
                              <Link
                                key={row.id}
                                to={`/transactions/${row.id}`}
                                className="flex min-h-[44px] items-center gap-3 border-t border-border px-4 py-2 pl-14 outline-none first:border-t-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                              >
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate text-sm font-medium">
                                    {row.title}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatTimeJakarta(row.occurredAt)}
                                  </span>
                                </span>
                                <SignedAmount
                                  kind={row.kind}
                                  amount={row.amount}
                                  className="shrink-0 text-sm font-semibold"
                                />
                              </Link>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
