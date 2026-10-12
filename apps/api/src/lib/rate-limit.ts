// shortcut: in-memory limiter resets on restart; fine for one instance.
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

const failures = new Map<string, number[]>();

function prune(ip: string, now: number): number[] {
  const seen = failures.get(ip) ?? [];
  const fresh = seen.filter((at) => now - at < WINDOW_MS);
  if (fresh.length === 0) failures.delete(ip);
  else failures.set(ip, fresh);
  return fresh;
}

export function recordFailure(ip: string, now: number = Date.now()): void {
  const list = prune(ip, now);
  list.push(now);
  failures.set(ip, list);
}

export function isLimited(ip: string, now: number = Date.now()): boolean {
  return prune(ip, now).length >= MAX_FAILURES;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}

export function resetRateLimits(): void {
  failures.clear();
}

interface RequestIpServer {
  requestIP?: ((request: Request) => { address?: string } | null) | undefined;
}

export function getClientIp(
  request: Request,
  server: RequestIpServer | null | undefined,
): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const address = server?.requestIP?.(request)?.address;
  if (address) return address;
  return "unknown";
}
