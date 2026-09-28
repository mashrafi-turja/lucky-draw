import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

// Routes that require a valid admin session.
const PROTECTED_PREFIXES = [
  "/admin/dashboard",
  "/api/participants",
  "/api/gifts",
  "/api/draw",
  "/api/sessions",
  "/api/winners",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valid = token ? await verifySessionToken(token) : false;

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/dashboard/:path*",
    "/api/participants/:path*",
    "/api/gifts/:path*",
    "/api/draw/:path*",
    "/api/sessions/:path*",
    "/api/winners/:path*",
  ],
};
