import NextAuth from "next-auth";

import { authConfig } from "./auth.config";
import { magAanmelden, registreerAanmelding } from "@/lib/gebruikers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Wie binnen mag: adressen uit TOEGELATEN_EMAILS, en iedereen die op de
     * pagina Gebruikers is toegevoegd en nog actief staat. Al de rest wordt
     * geweigerd, ook al heeft die persoon een geldig Google-account.
     */
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email || profile?.email_verified === false) return false;
      if (!(await magAanmelden(email))) return false;

      await registreerAanmelding(email, profile?.name ?? null);
      return true;
    },
  },
});
