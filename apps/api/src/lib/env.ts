export const EXAMPLE_JWT_SECRET =
  "change-me-to-a-random-string-of-at-least-32-characters";
export const EXAMPLE_YUTO_PASSWORD =
  "change-me-to-a-password-of-at-least-12-chars";

export interface Env {
  jwtSecret: string;
  yutoPassword: string;
  port: number;
  nodeEnv: string;
  cookieSecure: boolean;
  mapEnabled: boolean;
  databaseUrl: string;
}

type EnvSource = Record<string, string | undefined>;

function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined) return fallback;
  return raw === "true";
}

export function loadEnv(source: EnvSource): Env {
  const jwtSecret = source.JWT_SECRET ?? "";
  if (
    jwtSecret.length < 32 ||
    jwtSecret === EXAMPLE_JWT_SECRET
  ) {
    throw new Error(
      "Refusing to start: JWT_SECRET must be a random string of at least 32 characters.",
    );
  }

  const yutoPassword = source.YUTO_PASSWORD ?? "";
  if (
    yutoPassword.length < 12 ||
    yutoPassword === EXAMPLE_YUTO_PASSWORD
  ) {
    throw new Error(
      "Refusing to start: YUTO_PASSWORD must be at least 12 characters.",
    );
  }

  const port = Number(source.PORT ?? "3000");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Refusing to start: PORT must be a valid port number.");
  }

  const nodeEnv = source.NODE_ENV ?? "development";

  return {
    jwtSecret,
    yutoPassword,
    port,
    nodeEnv,
    cookieSecure: parseBoolean(source.COOKIE_SECURE, nodeEnv === "production"),
    mapEnabled: parseBoolean(source.MAP_ENABLED, true),
    databaseUrl:
      source.DATABASE_URL ?? "postgres://yuto:yuto@localhost:5432/yuto",
  };
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = loadEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
