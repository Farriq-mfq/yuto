import {
  ChartBarIcon,
  ChevronRightIcon,
  DeviceDesktopIcon,
  MinusIcon,
  MoonIcon,
  ReceiptIcon,
  SunIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "@/icons";
import { yutoIcon64 } from "@/logo";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { KindBadge, SignedAmount } from "@/components/SignedAmount";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isUnauthorized } from "../lib/api";
import { previousMonth, weekDelta } from "../lib/balanceStats";
import {
  currentMonthJakarta,
  dayKeyJakarta,
  formatDayJakarta,
  formatRupiah,
  formatTimeJakarta,
} from "../lib/format";
import {
  fetchAccountsSummary,
  fetchMonthTransactions,
  type MonthTransaction,
  type TxKind,
} from "../lib/queries";
import { useTheme, type ThemePreference } from "../lib/theme";
import { strings } from "../strings";

type Filter = "all" | TxKind;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: strings.filterAll },
  { value: "expense", label: strings.filterExpense },
  { value: "income", label: strings.filterIncome },
];

/** Ikon + label tiap pilihan tema di menu. */
const themeOptions = [
  { value: "system", label: strings.themeSystem, Icon: DeviceDesktopIcon },
  { value: "light", label: strings.themeLight, Icon: SunIcon },
  { value: "dark", label: strings.themeDark, Icon: MoonIcon },
] as const;

interface DayGroup {
  key: string;
  label: string;
  net: number;
  rows: MonthTransaction[];
}

function groupByDay(rows: MonthTransaction[]): DayGroup[] {
  const groups = new Map<string, MonthTransaction[]>();
  for (const row of rows) {
    const key = dayKeyJakarta(row.occurredAt);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, dayRows]) => ({
      key,
      label: formatDayJakarta(dayRows[0]?.occurredAt ?? key),
      net: dayRows.reduce(
        (sum, row) => sum + (row.kind === "income" ? row.amount : -row.amount),
        0,
      ),
      rows: dayRows,
    }));
}

export default function Home() {
  const [month, setMonth] = useState(() => currentMonthJakarta());
  const [filter, setFilter] = useState<Filter>("all");
  // Potret "sekarang" sekali per mount agar jendela 7 hari stabil.
  const [nowMs] = useState(() => Date.now());
  const currentMonth = currentMonthJakarta(new Date(nowMs));
  const lastMonth = previousMonth(currentMonth);
  const { preference, setPreference } = useTheme();
  const activeTheme =
    themeOptions.find((option) => option.value === preference) ??
    themeOptions[0];
  const ThemeIcon = activeTheme.Icon;

  // shortcut: ringkasan bulan diagregat client-side dari daftar transaksi
  // bulan ini (tanpa endpoint reports).
  const summary = useQuery({
    queryKey: ["transactions", month],
    queryFn: () => fetchMonthTransactions(month),
    retry: false,
  });
  const filtered = useQuery({
    queryKey: ["transactions", month, filter],
    queryFn: () =>
      fetchMonthTransactions(month, filter === "all" ? undefined : filter),
    enabled: filter !== "all",
    retry: false,
  });

  // Key ["accounts", "summary"] dipakai ulang agar cache dipakai bersama Wallet.
  const accounts = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: fetchAccountsSummary,
    retry: false,
  });
  // shortcut: agregat client, pindah ke endpoint server bila lambat —
  // delta 7 hari butuh transaksi bulan berjalan + bulan lalu agar jendela
  // 7 hari selalu tertutup walau sekarang awal bulan. Bila `month` adalah
  // bulan berjalan, datanya dipakai ulang dari `summary` (key cache sama).
  const currentTx = useQuery({
    queryKey: ["transactions", currentMonth],
    queryFn: () => fetchMonthTransactions(currentMonth),
    enabled: month !== currentMonth,
    retry: false,
  });
  const lastTx = useQuery({
    queryKey: ["transactions", lastMonth],
    queryFn: () => fetchMonthTransactions(lastMonth),
    retry: false,
  });

  const list = filter === "all" ? summary.data : filtered.data;
  const pending =
    summary.isPending ||
    accounts.isPending ||
    (filter !== "all" && filtered.isPending);
  const queryError =
    summary.error ??
    accounts.error ??
    (filter !== "all" ? filtered.error : null);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const row of summary.data ?? []) {
      if (row.kind === "income") income += row.amount;
      else expense += row.amount;
    }
    return { income, expense, net: income - expense };
  }, [summary.data]);

  const groups = useMemo(() => groupByDay(list ?? []), [list]);

  // why: transfer antar akun tak mengubah total semua akun (keluar dari
  // satu akun = masuk ke akun lain), jadi delta hanya menjumlah efek
  // income (+) dan expense (−) — lihat weekDelta.
  const delta = useMemo(() => {
    const rows = [
      ...(month === currentMonth ? (summary.data ?? []) : (currentTx.data ?? [])),
      ...(lastTx.data ?? []),
    ];
    return weekDelta({
      totalNow: accounts.data?.totalBalance ?? 0,
      transactions: rows,
      nowMs,
    }).delta;
  }, [
    month,
    currentMonth,
    summary.data,
    currentTx.data,
    lastTx.data,
    accounts.data,
    nowMs,
  ]);

  // Baris delta hanya tampil bila kedua sumber jendelanya sukses; gagal
  // request delta tak boleh meruntuhkan seluruh halaman.
  const deltaReady =
    month === currentMonth
      ? summary.isSuccess && lastTx.isSuccess
      : currentTx.isSuccess && lastTx.isSuccess;

  function refetch() {
    void summary.refetch();
    void accounts.refetch();
    if (month !== currentMonth) void currentTx.refetch();
    void lastTx.refetch();
    if (filter !== "all") void filtered.refetch();
  }

  if (
    (summary.error && isUnauthorized(summary.error)) ||
    (accounts.error && isUnauthorized(accounts.error)) ||
    (currentTx.error && isUnauthorized(currentTx.error)) ||
    (lastTx.error && isUnauthorized(lastTx.error)) ||
    (filtered.error && isUnauthorized(filtered.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={yutoIcon64}
            alt={strings.appLogoAlt}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <h1 className="truncate font-display text-xl font-bold">{strings.homeTitle}</h1>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 min-[380px]:w-auto">
          <Input
            id="month-input"
            type="month"
            aria-label={strings.monthLabel}
            value={month}
            onChange={(event) => {
              if (event.target.value !== "") setMonth(event.target.value);
            }}
            className="min-h-[44px] min-w-0 flex-1 min-[380px]:w-[170px] min-[380px]:flex-none"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={strings.themeMenuLabel}
                  title={strings.themeMenuLabel}
                  className="size-11 shrink-0"
                >
                  <ThemeIcon size={20} aria-hidden="true" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={preference}
                onValueChange={(next) =>
                  setPreference(next as ThemePreference)
                }
              >
                {themeOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="min-h-[44px]"
                  >
                    <option.Icon size={20} aria-hidden="true" />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {pending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-5 flex flex-col gap-3"
        >
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : queryError ? (
        <Card className="mt-5">
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
          {/* Label "Total saldo semua akun" sengaja berbeda dari "Total saldo"
              di Wallet dan "Net bulan ini" (PRD acceptance 5). */}
          <Card className="mt-5" aria-label={strings.homeTotalBalance}>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {strings.homeTotalBalance}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {formatRupiah(accounts.data?.totalBalance ?? 0)}
              </p>
              {deltaReady ? (
                delta === 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                    <MinusIcon size={16} aria-hidden="true" />
                    {strings.weekFlat}
                  </p>
                ) : delta > 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                    <TrendingUpIcon size={16} aria-hidden="true" />
                    +{formatRupiah(delta)} {strings.weekUp}
                  </p>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium tabular-nums text-destructive">
                    <TrendingDownIcon size={16} aria-hidden="true" />
                    -{formatRupiah(Math.abs(delta))} {strings.weekDown}
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>

          <Card className="mt-5" aria-label={strings.netThisMonth}>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {strings.netThisMonth}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {formatRupiah(totals.net)}
              </p>
            </CardContent>
          </Card>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Card aria-label={strings.homeIncomeTitle}>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {strings.homeIncomeTitle}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{formatRupiah(totals.income)}
                </p>
              </CardContent>
            </Card>
            <Card aria-label={strings.homeExpenseTitle}>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {strings.homeExpenseTitle}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-destructive">
                  -{formatRupiah(totals.expense)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* why: banner hanya bila bulan tampil punya >=1 transaksi;
              bulan kosong tetap memakai empty state daftar. */}
          {(summary.data ?? []).length > 0 && (
            <Link
              to={`/reports?month=${month}`}
              className="mt-5 flex min-h-[56px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <ChartBarIcon size={20} strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">
                  {strings.analysisReadyTitle}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {strings.analysisReadyHint}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                {strings.viewAnalysis}
                <ChevronRightIcon size={20} aria-hidden="true" />
              </span>
            </Link>
          )}

          <Tabs
            value={filter}
            onValueChange={(next) => setFilter(next as Filter)}
            className="mt-5"
          >
            <TabsList
              aria-label={strings.filterLabel}
              className="h-auto w-full"
            >
              {filters.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="min-h-[44px] flex-1"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {(list ?? []).length === 0 ? (
            <Card className="mt-5">
              <CardContent className="items-center p-8 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <ReceiptIcon size={24} strokeWidth={2} />
                </span>
                <p className="text-base font-semibold">
                  {strings.emptyTransactions}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {strings.emptyTransactionsHint}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-5 flex flex-col gap-5">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <h2 className="text-sm font-semibold">{group.label}</h2>
                    <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {group.net < 0 ? "-" : "+"}
                      {formatRupiah(Math.abs(group.net))}
                    </p>
                  </div>
                  <Card className="mt-2">
                    <CardContent className="gap-0 p-0">
                      {group.rows.map((row, index) => (
                        <Link
                          key={row.id}
                          to={`/transactions/${row.id}`}
                          className={`flex min-h-[56px] items-center gap-4 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
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
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
