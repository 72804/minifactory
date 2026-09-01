import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { assertAdminSecret, getServerEnv } from "@minifactory/config/env";
import { isProductionEnv, safeEqualText } from "@minifactory/config/security";

const COOKIE = "mf_admin";

export function adminSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("minifactory-admin-session").digest("hex");
}

export function isAdminConfigured(): boolean {
  return Boolean(getServerEnv().ADMIN_SECRET);
}

export function adminAccessDeniedReason(): string | null {
  if (isAdminConfigured()) {
    return null;
  }
  if (isProductionEnv()) {
    return "Admin is disabled because ADMIN_SECRET is not set.";
  }
  return "Set ADMIN_SECRET in the environment before using this dashboard.";
}

export async function isAdminAuthenticated(): Promise<boolean> {
  let secret: string;
  try {
    secret = assertAdminSecret();
  } catch {
    return false;
  }
  const cookieStore = await cookies();
  const provided = cookieStore.get(COOKIE)?.value;
  if (!provided) {
    return false;
  }
  return safeEqualText(provided, adminSessionToken(secret));
}

export { COOKIE as ADMIN_COOKIE };
