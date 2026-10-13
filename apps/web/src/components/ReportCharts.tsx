import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { SignedAmount } from "@/components/SignedAmount";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatRupiah } from "../lib/format";
import type { ReportCategory, TxKind } from "../lib/queries";
import { strings } from "../strings";

/**
 * Grafik suplemen layar Reports: donat porsi + batang total per kategori.
 * Selalu dari `rows` yang sudah di-fetch (tanpa request baru). Daftar baris
 * berlabel + persen + SignedAmount di bawahnya tetap jadi sumber utama,
 * sehingga chart disembunyikan dari AT (aria-hidden) dan tiap figure hanya
 * membawa aria-label ringkas.
 */

// why: warna segmen adalah data milik user dari DB (preseden dot kategori),
// jadi dipakai apa adanya; cukup validasi hex sederhana dengan satu fallback
// warna muted bila kosong/tak valid.
const HEX_COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

function segmentFill(color: string): string {
  const normalized = color.trim();
  return HEX_COLOR.test(normalized) ? normalized : "var(--muted-foreground)";
}

function toAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Nama kategori di sumbu Y harus muat di 360px; nama penuh tetap ada di
 * tooltip chart dan di daftar baris di bawah.
 */
function shortName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 14 ? `${trimmed.slice(0, 13)}…` : trimmed;
}

export function ReportCharts({
  rows,
  total,
  kind,
}: {
  rows: ReportCategory[];
  /** Total kind yang tampil bulan itu (dari ringkasan yang sudah di-fetch). */
  total: number;
  kind: TxKind;
}) {
  const kindText =
    kind === "income" ? strings.filterIncome : strings.filterExpense;
  const segments = rows.map((row) => ({
    id: row.categoryId,
    name: row.name,
    value: row.total,
    fill: segmentFill(row.color),
  }));

  return (
    <Card className="mt-4">
      <CardContent>
        <figure
          role="img"
          aria-label={`${strings.reportsDonutAria} ${kindText} ${formatRupiah(total)}`}
        >
          <p className="text-sm font-semibold">{strings.reportsDonutTitle}</p>
          <div aria-hidden="true" className="relative mt-2">
            <ChartContainer
              config={{}}
              className="mx-auto aspect-square max-h-[240px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        formatRupiah(toAmount(value)),
                        String(name ?? ""),
                      ]}
                    />
                  }
                />
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                >
                  {segments.map((segment) => (
                    <Cell key={segment.id} fill={segment.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <span className="text-xs text-muted-foreground">{kindText}</span>
              <SignedAmount
                kind={kind}
                amount={total}
                className="text-lg font-bold"
              />
            </div>
          </div>
        </figure>

        <figure
          role="img"
          aria-label={`${strings.reportsBarAria} ${kindText} ${formatRupiah(total)}`}
          className="mt-6 border-t border-border pt-4"
        >
          <p className="text-sm font-semibold">{strings.reportsBarTitle}</p>
          <div
            aria-hidden="true"
            className="mt-2"
          >
            <ChartContainer
              config={{}}
              className="aspect-auto w-full"
              style={{ height: Math.max(120, segments.length * 40 + 16) }}
            >
              <BarChart data={segments} layout="vertical">
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={112}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => shortName(String(value))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => [
                        formatRupiah(toAmount(value)),
                        kindText,
                      ]}
                    />
                  }
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {segments.map((segment) => (
                    <Cell key={segment.id} fill={segment.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}
