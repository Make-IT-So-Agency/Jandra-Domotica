import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Het deel van de aanmeldconfiguratie dat ook in de middleware mag draaien.
 *
 * De middleware draait op de edge-omgeving en mag dus niet aan de databank.
 * Daarom staat hier enkel het hoognodige: of iemand aangemeld is. Wélke
 * rechten die persoon heeft, wordt op elke pagina zelf opgevraagd, waar de
 * databank wél bereikbaar is en de rol altijd actueel is.
 */
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
