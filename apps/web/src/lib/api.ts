import { treaty } from "@elysiajs/eden";
import type { App } from "../../../api/src/app";

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
