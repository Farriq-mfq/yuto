import {
  CalendarIcon,
  DeviceDesktopIcon,
  MoonIcon,
  ReceiptIcon,
  SunIcon,
} from "@/icons";
import { yutoIcon64 } from "@/logo";
import { useMemo, useState } from "react";
import { id as localeId } from "react-day-picker/locale";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { KindBadge, SignedAmount } from "@/components/SignedAmount";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isUnauthorized } from "../lib/api";
import {
  currentMonthJakarta,
  dayKeyJakarta,
  firstDateOfMonthKey,
  formatDayJakarta,
  formatMonthId,
  formatRupiah,
  formatTimeJakarta,
  monthKeyFromDate,
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
  const [monthOpen, setMonthOpen] = useState(false);
  const { preference, setPreference } = useTheme();
  const activeTheme =
    themeOptions.find((option) => option.value === preference) ??
    themeOptions[0];
  const ThemeIcon = activeTheme.Icon;
  const monthDate = firstDateOfMonthKey(month);
  const monthButtonLabel = formatMonthId(month) ?? month;

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
            <Label htmlFor="month-button">{strings.monthLabel}</Label>
            <Popover open={monthOpen} onOpenChange={setMonthOpen}>
              <PopoverTrigger
                render={
                  <Button
                    id="month-button"
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full min-w-0 justify-start font-normal min-[380px]:w-[170px]"
                  >
                    <CalendarIcon size={20} aria-hidden="true" />
                    <span className="truncate">{monthButtonLabel}</span>
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-auto p-2">
                <Calendar
                  mode="single"
                  locale={localeId}
                  key={month}
                  defaultMonth={monthDate ?? new Date()}
                  selected={
                    month === currentMonthJakarta() ? new Date() : undefined
                  }
                  onSelect={(next) => {
                    if (!next) return;
                    setMonth(monthKeyFromDate(next));
                    setMonthOpen(false);
                  }}
                  className="[--cell-size:--spacing(11)]"
                />
              </PopoverContent>
            </Popover>
          </div>
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

          <Tabs
            value={filter}
            onValueChange={(next) => setFilter(next as Filter)}
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
