import {
  DeviceDesktopIcon,
  MoonIcon,
  ReceiptIcon,
  SunIcon,
} from "@/icons";
import { yutoIcon64 } from "@/logo";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { KindBadge, SignedAmount } from "@/components/SignedAmount";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { isUnauthorized } from "../lib/api";
import {
  currentMonthJakarta,
  dayKeyJakarta,
  formatDayJakarta,
  formatRupiah,
  formatTimeJakarta,
} from "../lib/format";
import {
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

/** Ikon + label toggle tema sesuai preferensi aktif (system → light → dark). */
const themeMeta: Record<ThemePreference, { label: string; Icon: typeof SunIcon }> = {
  system: { label: strings.themeToggleSystem, Icon: DeviceDesktopIcon },
  light: { label: strings.themeToggleLight, Icon: SunIcon },
  dark: { label: strings.themeToggleDark, Icon: MoonIcon },
};

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
  const { preference, isDark, cycle } = useTheme();
  const theme = themeMeta[preference];
  const ThemeIcon = theme.Icon;

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

  const list = filter === "all" ? summary.data : filtered.data;
  const pending = summary.isPending || (filter !== "all" && filtered.isPending);
  const queryError = summary.error ?? (filter !== "all" ? filtered.error : null);

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

  function refetch() {
    void summary.refetch();
    if (filter !== "all") void filtered.refetch();
  }

  if (
    (summary.error && isUnauthorized(summary.error)) ||
    (filtered.error && isUnauthorized(filtered.error))
  ) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
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
        <div className="flex w-full min-w-0 items-end gap-2 min-[380px]:w-auto">
          <div className="flex min-w-0 flex-1 flex-col gap-2 min-[380px]:flex-none">
            <Label htmlFor="month">{strings.monthLabel}</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="min-h-[44px] w-full min-w-0 min-[380px]:w-[150px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={cycle}
            aria-label={theme.label}
            title={theme.label}
            aria-pressed={isDark}
            className="size-11 shrink-0"
          >
            <ThemeIcon size={20} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {pending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-4 flex flex-col gap-2"
        >
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : queryError ? (
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
                {formatRupiah(totals.net)}
              </p>
              <div className="mt-3 flex gap-4 text-sm tabular-nums">
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

          <div role="group" aria-label="Filter" className="mt-4 flex gap-2">
            {filters.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={filter === option.value ? "default" : "secondary"}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className="min-h-[44px] flex-1"
              >
                {option.label}
              </Button>
            ))}
          </div>

          {(list ?? []).length === 0 ? (
            <Card className="mt-4">
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
            <div className="mt-4 flex flex-col gap-4">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <h2 className="text-sm font-semibold">{group.label}</h2>
                    <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {group.net < 0 ? "-" : "+"}
                      {formatRupiah(Math.abs(group.net))}
                    </p>
                  </div>
                  <Card className="mt-1">
                    <CardContent className="gap-0 p-0">
                      {group.rows.map((row, index) => (
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
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
