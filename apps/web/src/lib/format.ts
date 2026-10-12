const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  return rupiah.format(Math.round(amount));
}

export function currentMonthJakarta(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

const JAKARTA = "Asia/Jakarta";

/** Kunci pengelompokan harian `YYYY-MM-DD` dalam zona Asia/Jakarta. */
export function dayKeyJakarta(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/** Header grup harian, mis. "Senin, 12 Okt 2026". */
export function formatDayJakarta(value: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Jam transaksi `HH:mm` dalam zona Asia/Jakarta. */
export function formatTimeJakarta(value: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Tanggal + jam lengkap untuk layar detail. */
export function formatDateTimeJakarta(value: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Ubah instant menjadi nilai `datetime-local` (`YYYY-MM-DDTHH:mm`) dalam
 * zona Asia/Jakarta untuk prefill form.
 */
export function toDateTimeLocalJakarta(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Nilai `datetime-local` untuk "sekarang" dalam zona Asia/Jakarta. */
export function nowDateTimeLocalJakarta(now: Date = new Date()): string {
  return toDateTimeLocalJakarta(now);
}
