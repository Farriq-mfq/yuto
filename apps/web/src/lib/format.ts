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
 * Ubah instant menjadi nilai waktu lokal (`YYYY-MM-DDTHH:mm`) dalam
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

/** Nilai waktu lokal untuk "sekarang" dalam zona Asia/Jakarta. */
export function nowDateTimeLocalJakarta(now: Date = new Date()): string {
  return toDateTimeLocalJakarta(now);
}

const MONTH_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

const MONTH_LONG_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Pecah nilai `YYYY-MM-DDTHH:mm` menjadi potongan tanggal (`YYYY-MM-DD`)
 * dan jam (`HH:mm`) untuk kontrol tanggal & jam yang terpisah.
 */
export function splitLocalDateTime(value: string): {
  date: string;
  time: string;
} {
  const separator = value.indexOf("T");
  if (separator < 0) return { date: value, time: "" };
  return {
    date: value.slice(0, separator),
    time: value.slice(separator + 1),
  };
}

/**
 * Label tanggal Indonesia dari potongan `YYYY-MM-DD`, mis. "12 Okt 2026".
 * Murni dari string (tanpa `new Date`) agar tak ada geser zona waktu.
 */
export function formatLocalDateId(datePart: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return null;
  const month = MONTH_SHORT_ID[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  return `${day} ${month} ${match[1]}`;
}

/**
 * Label bulan Indonesia dari kunci `YYYY-MM`, mis. "Oktober 2026".
 * Murni dari string (tanpa `new Date`) agar tak ada geser zona waktu.
 */
export function formatMonthId(month: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const name = MONTH_LONG_ID[Number(match[2]) - 1];
  if (!name) return null;
  return `${name} ${match[1]}`;
}

/**
 * Potongan `YYYY-MM-DD` menjadi Date lokal tengah malam untuk Calendar.
 * Konstruktor lokal dipakai (bukan parse ISO) agar hari tak bergeser zona.
 * Tanggal tak nyata (mis. 2026-02-30) → undefined.
 */
export function localDateFromDatePart(datePart: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return undefined;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

/** Date lokal menjadi kunci bulan `YYYY-MM` dari potongan kalender lokal. */
export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/**
 * Gabung hari pilihan Calendar + jam (`HH:mm`) menjadi `YYYY-MM-DDTHH:mm`
 * dengan format yang sama persis seperti helper existing.
 */
export function combineLocalDateTime(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${time}`;
}

/** Kunci `YYYY-MM` menjadi hari pertama bulan itu (defaultMonth Calendar). */
export function firstDateOfMonthKey(month: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return undefined;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return undefined;
  return new Date(Number(match[1]), monthIndex, 1);
}
