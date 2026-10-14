// Epoch-ms time helpers for the local engine.
// SQLite has no timestamptz, so every timestamp column is INTEGER ms epoch.
// Conversion is lossless both ways: PG timestamptz <-> ISO string <-> ms.
export function toEpochMs(date: Date): number {
  return date.getTime();
}

export function fromEpochMs(ms: number): Date {
  return new Date(ms);
}

export function nowEpochMs(): number {
  return Date.now();
}

// Serialize for the future server push (PG timestamptz accepts ISO strings).
export function toPostgresTimestamptz(ms: number): string {
  return new Date(ms).toISOString();
}
