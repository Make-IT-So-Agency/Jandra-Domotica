import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

// Bewust de lichte configuratie zonder databanktoegang: de middleware draait
// op de edge-omgeving en controleert alleen of iemand aangemeld is.
const { auth } = NextAuth(authConfig);

/**
 * Schermt de hele app af. De koppeling met Home Assistant (/api/ingest), de
 * automatische taken (/api/cron) en de webhooks van Telegram (/api/telegram
 * voor Opvang_bot, /api/bouw/telegram voor de bot van Bouw) hebben hun eigen
 * sleutel en zitten daarom niet achter de Google-login. De setup-routes van
 * die bots wel: die zijn enkel voor de hoofdbeheerder. /extern/<token> is
 * voor een partij met een persoonlijke link van Bouw: elke pagina en actie
 * daar kijkt het token zelf na (zie lib/bouw/links.ts).
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;

  const openbaar =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/api/telegram" ||
    pathname === "/api/bouw/telegram" ||
    pathname.startsWith("/extern/") ||
    pathname === "/login";

  if (openbaar || request.auth) return;

  const inloggen = new URL("/login", request.nextUrl.origin);
  inloggen.searchParams.set("volgende", pathname);
  return Response.redirect(inloggen);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
