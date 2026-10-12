import {
  IconDeviceDesktop,
  IconMoon,
  IconReceipt,
  IconSun,
} from "@tabler/icons-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, isUnauthorized } from "../lib/api";
import { currentMonthJakarta, formatRupiah } from "../lib/format";
import { useTheme, type ThemePreference } from "../lib/theme";
import { strings } from "../strings";

type Filter = "all" | "expense" | "income";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: strings.filterAll },
  { value: "expense", label: strings.filterExpense },
  { value: "income", label: strings.filterIncome },
];

/** Ikon + label toggle tema sesuai preferensi aktif (system → light → dark). */
const themeMeta: Record<ThemePreference, { label: string; Icon: typeof IconSun }> = {
  system: { label: strings.themeToggleSystem, Icon: IconDeviceDesktop },
  light: { label: strings.themeToggleLight, Icon: IconSun },
  dark: { label: strings.themeToggleDark, Icon: IconMoon },
};

export default function Home() {
  const [month, setMonth] = useState(() => currentMonthJakarta());
  const [filter, setFilter] = useState<Filter>("all");
  const { preference, isDark, cycle } = useTheme();
  const theme = themeMeta[preference];
  const ThemeIcon = theme.Icon;

  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await api.api.auth.session.get();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  if (session.error && isUnauthorized(session.error)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">{strings.homeTitle}</h1>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="month">{strings.monthLabel}</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="min-h-[44px]"
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

      {session.isPending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-4 flex flex-col gap-2"
        >
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : session.isError ? (
        <Card className="mt-4">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => session.refetch()}
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
                {formatRupiah(0)}
              </p>
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

          <Card className="mt-4">
            <CardContent className="items-center p-8 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <IconReceipt size={24} strokeWidth={2} />
              </span>
              <p className="text-base font-semibold">
                {strings.emptyTransactions}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {strings.emptyTransactionsHint}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
