import { NextResponse } from "next/server";
import { assertAdminSecret } from "@minifactory/config/env";
import { isProductionEnv, safeEqualText } from "@minifactory/config/security";
import { ADMIN_COOKIE, adminSessionToken } from "../../../lib/auth";

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = assertAdminSecret();
  } catch {
    return NextResponse.json(
      { error: isProductionEnv() ? "Admin is disabled" : "ADMIN_SECRET is not configured" },
      { status: 503 },
    );
  }
  const form = await request.formData();
  const provided = String(form.get("secret") ?? "");
  if (!safeEqualText(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(ADMIN_COOKIE, adminSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionEnv(),
    path: "/",
  });
  return response;
}
