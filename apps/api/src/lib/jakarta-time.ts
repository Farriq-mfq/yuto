export type JakartaTimeFailure = "invalid-month" | "invalid-date";

export class JakartaTimeError extends Error {
  readonly failure: JakartaTimeFailure;

  constructor(failure: JakartaTimeFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

// Asia/Jakarta is UTC+7 with no DST, so a fixed offset is exact.
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Pure helpers: Jakarta month/day boundaries converted to UTC for
// timestamptz comparison. Start is inclusive, end is exclusive.
export function jakartaMonthRange(month: string): {
  start: Date;
  end: Date;
} {
  const match = MONTH_RE.exec(month);
  if (!match) {
    throw new JakartaTimeError(
      "invalid-month",
      "Format bulan tidak valid. Gunakan YYYY-MM.",
    );
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const start = new Date(Date.UTC(year, mon - 1, 1) - JAKARTA_OFFSET_MS);
  const endYear = mon === 12 ? year + 1 : year;
  const endMonth = mon === 12 ? 1 : mon + 1;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1) - JAKARTA_OFFSET_MS);
  return { start, end };
}

export function jakartaDayRange(date: string): { start: Date; end: Date } {
  const match = DATE_RE.exec(date);
  if (!match) {
    throw new JakartaTimeError(
      "invalid-date",
      "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
    );
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const day = Number(match[3]);
  if (day > daysInMonth(year, mon)) {
    throw new JakartaTimeError(
      "invalid-date",
      "Tanggal tidak valid untuk bulan tersebut.",
    );
  }
  const startMs = Date.UTC(year, mon - 1, day) - JAKARTA_OFFSET_MS;
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS) };
}

// Previous calendar month as YYYY-MM (rolls over January to December).
export function previousMonth(month: string): string {
  const match = MONTH_RE.exec(month);
  if (!match) {
    throw new JakartaTimeError(
      "invalid-month",
      "Format bulan tidak valid. Gunakan YYYY-MM.",
    );
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon === 1) return `${year - 1}-12`;
  return `${year}-${String(mon - 1).padStart(2, "0")}`;
}
