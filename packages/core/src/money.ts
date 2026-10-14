// Pure money formatting/parsing for integer rupiah. Moved byte-identical
// from apps/web/src/lib/format.ts so API and web share one implementation.
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  return rupiah.format(Math.round(amount));
}

const percentId = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Persen Indonesia satu desimal, mis. `33,3%`. */
export function formatPercent(value: number): string {
  return `${percentId.format(value)}%`;
}

/** Ambil digit saja, maksimal 15 digit agar aman sebagai integer. */
export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 15);
}

/** Parse teks input menjadi integer rupiah (>= 0). */
export function parsePositiveInt(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
