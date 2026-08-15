import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Enkel de adressen uit TOEGELATEN_EMAILS geraken binnen. Iedereen met een
 * Google-account kan de inlogknop indrukken, maar wie niet in de lijst staat,
 * wordt geweigerd. Een lege lijst sluit dus iedereen buiten; dat is bewust
 * veiliger dan per ongeluk de deur openzetten.
 */
function toegelatenAdressen(): string[] {
  return (process.env.TOEGELATEN_EMAILS ?? "")
    .split(",")
    .map((adres) => adres.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email || profile?.email_verified === false) return false;
      return toegelatenAdressen().includes(email);
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    },
  },
});

/** Gooit een fout als er niemand ingelogd is. Voor gebruik in serveracties. */
export async function vereistAangemeld(): Promise<string> {
  const sessie = await auth();
  const email = sessie?.user?.email;
  if (!email) throw new Error("Niet aangemeld.");
  return email;
}
