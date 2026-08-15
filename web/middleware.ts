import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

// Bewust de lichte configuratie zonder databanktoegang: de middleware draait
// op de edge-omgeving en controleert alleen of iemand aangemeld is.
const { auth } = NextAuth(authConfig);

/**
 * Schermt de hele app af. De koppeling met Home Assistant (/api/ingest) en de
 * automatische taken (/api/cron) hebben hun eigen sleutel en zitten daarom
 * niet achter de Google-login.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;

  const openbaar =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/login";

  if (openbaar || request.auth) return;

  const inloggen = new URL("/login", request.nextUrl.origin);
  inloggen.searchParams.set("volgende", pathname);
  return Response.redirect(inloggen);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
