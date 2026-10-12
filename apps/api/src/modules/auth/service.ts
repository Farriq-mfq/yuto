import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "yuto_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function verifyPassword(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function createSessionToken(jwtSecret: string): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(jwtSecret));
}

export async function verifySessionToken(
  token: string,
  jwtSecret: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(jwtSecret),
    );
    return payload.sub === "owner";
  } catch {
    return false;
  }
}
