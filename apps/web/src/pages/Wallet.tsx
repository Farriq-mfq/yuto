import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { cn } from "cn";
import { Logo } from "idn-finlogos/react";
import {
  BanknoteIcon,
  EyeIcon,
  EyeOffIcon,
  LandmarkIcon,
  PlusIcon,
  TransferIcon,
  WalletIcon,
} from "@/icons";
import { brandFor, fallbackIconName } from "@/brands";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isUnauthorized } from "../lib/datasource";
import { useDataSource } from "../lib/datasourceContext";
import { formatRupiah } from "../lib/format";
import { useHideBalance } from "../lib/hideBalance";
import { type AccountType } from "../lib/datasource";
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

const FALLBACK_ICONS = {
  landmark: LandmarkIcon,
  wallet: WalletIcon,
  banknote: BanknoteIcon,
} as const;

export default function Wallet() {
  const dataSource = useDataSource();
  const [hidden, toggleHidden] = useHideBalance();
  const summary = useQuery({
    queryKey: ["accounts", "summary"],
    queryFn: () => dataSource.getAccountsSummary(),
    retry: false,
  });

  if (summary.error && isUnauthorized(summary.error)) {
    return <Navigate to="/login" replace />;
  }

  const display = (amount: number) =>
    hidden ? strings.balanceHidden : formatRupiah(amount);

  return (
    <main
      id="konten-utama"
      tabIndex={-1}
      className="mx-auto w-full max-w-[480px] bg-background px-4 pb-24 pt-6 sm:px-5"
    >
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
            <div className="mt-5 flex flex-col gap-4">
              {summary.data.accounts.map((account) => {
                const brand = brandFor(account.institution, account.type);
                const FallbackIcon =
                  FALLBACK_ICONS[fallbackIconName(account.type)];
                // Kartu berwarna hanya untuk brand berlogo; tile tunai dan
                // ikon fallback tetap memakai kartu default.
                const branded = brand?.kind === "logo" ? brand : null;
                return (
                  <Link
                    key={account.id}
                    to={`/wallet/${account.id}`}
                    aria-label={account.name}
                    className="block min-h-[44px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Card
                      className={cn(
                        "rounded-2xl",
                        branded && "text-white ring-white/20",
                      )}
                      // why: warna kartu data brand (absolut, sama di light
                      // dan dark), bukan token desain. Gradien diturunkan
                      // dari satu hex via color-mix agar tetap satu sumber
                      // warna per brand di src/brands.
                      style={
                        branded
                          ? {
                              backgroundImage: `linear-gradient(135deg, ${branded.background}, color-mix(in oklch, ${branded.background}, black 30%))`,
                            }
                          : undefined
                      }
                    >
                      <CardContent>
                        <div className="flex items-center gap-3">
                          {brand ? (
                            brand.kind === "logo" ? (
                              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white">
                                <Logo
                                  svg={brand.svg}
                                  size={28}
                                  title={brand.label}
                                  // why: idn-finlogos me-render span
                                  // inline-block berisi <svg> tanpa
                                  // width/height (hanya viewBox) sehingga
                                  // svg melebar melewati wrapper 28px;
                                  // paksa svg pas 28px + meet (aspect
                                  // terjaga, terpusat) di tengah tile 44px.
                                  className="flex items-center justify-center [&_svg]:block [&_svg]:h-7 [&_svg]:w-7"
                                />
                              </span>
                            ) : (
                              <span
                                aria-hidden="true"
                                // why: warna data brand, bukan token desain —
                                // lihat src/brands (tile dekoratif, makna di nama akun).
                                style={{
                                  backgroundColor: brand.background,
                                  color: brand.foreground,
                                }}
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                              >
                                {brand.initials}
                              </span>
                            )
                          ) : (
                            <span
                              aria-hidden="true"
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                            >
                              <FallbackIcon size={22} strokeWidth={2} />
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-bold">
                              {account.name}
                            </span>
                            <span
                              className={cn(
                                "text-xs",
                                // why: putih penuh (bukan white/70) agar teks
                                // 12px di atas gradien brand tetap lolos AA.
                                branded ? "text-white" : "text-muted-foreground",
                              )}
                            >
                              {account.institution} ·{" "}
                              {typeLabel(account.type)}
                            </span>
                          </span>
                          {account.showCategory ? (
                            <Badge
                              variant={branded ? "outline" : "secondary"}
                              className={cn(
                                "shrink-0",
                                branded && "border-white/40 text-white",
                              )}
                            >
                              {account.category}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xl font-bold tabular-nums">
                          {display(account.balance)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
