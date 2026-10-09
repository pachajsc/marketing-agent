// Chequeo optimista de sesión (solo mira si existe la cookie, sin ir a la
// base): redirige rápido a /login en rutas privadas y saca de /login y
// /register a quien ya tiene sesión. La verificación real está en cada página
// y Server Action (lib/server/session.ts), como pide la guía de Next.js.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PRIVATE_PREFIXES = ["/dashboard", "/prospects", "/strategy", "/settings"];
const AUTH_PAGES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  const isPrivate = PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isPrivate && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/prospects/:path*", "/strategy/:path*", "/settings/:path*", "/login", "/register"],
};
