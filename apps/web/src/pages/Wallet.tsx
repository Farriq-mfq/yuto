import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { cn } from "cn";
import {
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  TransferIcon,
  WalletIcon,
} from "@/icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isUnauthorized } from "../lib/api";
import { formatRupiah } from "../lib/format";
import { useHideBalance } from "../lib/hideBalance";
import { fetchAccountsSummary, type AccountType } from "../lib/queries";
import { strings } from "../strings";

const TYPE_LABELS: Record<AccountType, string> = {
  bank: strings.typeBank,
  ewallet: strings.typeEwallet,
  cash: strings.typeCash,
};

function typeLabel(type: string): string {
  if (type === "bank" || type === "ewallet" || type === "cash") {
    return TYPE_LABELS[type];
  }
  return type;
}

export default function Wallet() {
  const [hidden, toggleHidden] = useHideBalance();
  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: fetchAccountsSummary,
    retry: false,
  });

  if (summary.error && isUnauthorized(summary.error)) {
    return <Navigate to="/login" replace />;
  }

  const display = (amount: number) =>
    hidden ? strings.balanceHidden : formatRupiah(amount);

  return (
    <main className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">{strings.walletTitle}</h1>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleHidden}
          aria-label={hidden ? strings.showBalance : strings.hideBalance}
          title={hidden ? strings.showBalance : strings.hideBalance}
          aria-pressed={hidden}
          className="size-11 shrink-0"
        >
          {hidden ? (
            <EyeOffIcon size={20} aria-hidden="true" />
          ) : (
            <EyeIcon size={20} aria-hidden="true" />
          )}
        </Button>
      </div>

      {summary.isPending ? (
        <div
          aria-busy="true"
          aria-label={strings.loading}
          className="mt-5 flex flex-col gap-3"
        >
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : summary.isError ? (
        <Card className="mt-5">
          <CardContent className="items-center p-6 text-center">
            <p className="text-sm text-muted-foreground">{strings.loadError}</p>
            <Button
              type="button"
              onClick={() => summary.refetch()}
              className="mt-3 min-h-[44px]"
            >
              {strings.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Label "Total saldo" sengaja berbeda dari "Net bulan ini"
              di Home (PRD acceptance 5). */}
          <Card className="mt-5" aria-label={strings.totalBalance}>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {strings.totalBalance}
              </p>
              <p
                className="mt-1 text-3xl font-bold tabular-nums"
                aria-live="polite"
              >
                {display(summary.data.totalBalance)}
              </p>
            </CardContent>
          </Card>

          <div className="mt-5 flex gap-3">
            <Link
              to="/transfer"
              className={cn(buttonVariants(), "min-h-[44px] flex-1")}
            >
              <TransferIcon size={18} aria-hidden="true" />
              {strings.transferButton}
            </Link>
            <Link
              to="/wallet/new"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-h-[44px] flex-1",
              )}
            >
              <PlusIcon size={18} aria-hidden="true" />
              {strings.newAccountButton}
            </Link>
          </div>

          {summary.data.accounts.length === 0 ? (
            <Card className="mt-5">
              <CardContent className="items-center p-8 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <WalletIcon size={24} strokeWidth={2} />
                </span>
                <p className="text-base font-semibold">
                  {strings.emptyAccounts}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {strings.emptyAccountsHint}
                </p>
                <Link
                  to="/wallet/new"
                  className={cn(buttonVariants(), "mt-4 min-h-[44px]")}
                >
                  <PlusIcon size={18} aria-hidden="true" />
                  {strings.newAccountButton}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-5">
              <CardContent className="gap-0 p-0">
                {summary.data.accounts.map((account, index) => (
                  <Link
                    key={account.id}
                    to={`/wallet/${account.id}`}
                    className={`flex min-h-[56px] items-center gap-4 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      index > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <WalletIcon size={20} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {account.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {account.institution} · {typeLabel(account.type)}
                        {account.showCategory ? (
                          <Badge variant="secondary">{account.category}</Badge>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {display(account.balance)}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
