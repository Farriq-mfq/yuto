import { cn } from "cn";
import { formatRupiah } from "../lib/format";
import type { TxKind } from "../lib/queries";
import { strings } from "../strings";

/**
 * Nominal bertanda + warna sesuai DESIGN_BRIEF §5. Tanda selalu tampil
 * (tak pernah warna saja), digit rata dengan tabular-nums.
 */
export function SignedAmount({
  kind,
  amount,
  className,
}: {
  kind: TxKind;
  amount: number;
  className?: string;
}) {
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
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {kind === "income" ? strings.kindIncome : strings.kindExpense}
    </span>
  );
}
