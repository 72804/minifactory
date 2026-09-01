import { createHmac, timingSafeEqual } from "node:crypto";

export function isExampleDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const host = parsed.hostname;
    return (
      (user === "postgres" && password === "postgres" && (host === "localhost" || host === "127.0.0.1")) ||
      user === "USER" ||
      password === "PASSWORD"
    );
  } catch {
    return false;
  }
}

export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "").split("?")[0] || "(none)";
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${database}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function safeEqualHex(expectedHex: string, computed: Buffer): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== computed.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, computed);
}

export function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isProductionEnv(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}
