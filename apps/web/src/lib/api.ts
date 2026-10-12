import { treaty } from "@elysiajs/eden";
import type { App } from "../../../api/src/app";
import type { ErrorBody } from "../../../api/src/lib/errors";

const baseUrl =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export const api = treaty<App>(baseUrl);

export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("status" in error)) return undefined;
  const status = Number((error as { status: unknown }).status);
  return Number.isInteger(status) ? status : undefined;
}

export function isUnauthorized(error: unknown): boolean {
  return errorStatus(error) === 401;
}

export function isRateLimited(error: unknown): boolean {
  return errorStatus(error) === 429;
}

/**
 * Eden menggabungkan `ErrorBody` ke tipe `data` (sukses | error | null).
 * Guard ini menyingkirkan cabang error setelah `error` dicek null, tanpa
 * menulis ulang tipe response API.
 */
export function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object" &&
    (value as { error: unknown }).error !== null
  );
}
