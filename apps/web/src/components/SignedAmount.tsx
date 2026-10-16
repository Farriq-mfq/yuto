import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "../lib/format";
import type { TxKind } from "../lib/datasource";
import { strings } from "../strings";

/**
 * Nominal bertanda + warna sesuai DESIGN_BRIEF §5. Tanda selalu tampil
 * (tak pernah warna saja), digit rata dengan tabular-nums.
 */
export function SignedAmount({
  kind,
  amount,
  className,
  hidden = false,
}: {
  kind: TxKind;
  amount: number;
  className?: string;
  hidden?: boolean;
}) {
  if (hidden) {
    return (
      <span className={cn("tabular-nums text-muted-foreground", className)}>
        {strings.balanceHidden}
      </span>
    );
  }
  return (
    <span
      className={cn(
        kind === "income"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-destructive",
        "tabular-nums",
        className,
      )}
    >
      {kind === "income" ? "+" : "-"}
      {formatRupiah(amount)}
    </span>
  );
}

/** Lencana kecil jenis transaksi (Keluar/Masuk). */
export function KindBadge({ kind }: { kind: TxKind }) {
  return (
    <Badge variant="secondary">
      {kind === "income" ? strings.kindIncome : strings.kindExpense}
    </Badge>
  );
}
