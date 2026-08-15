import type { Metadata } from "next";
import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { Navigatie } from "@/components/navigatie";

import "./globals.css";

export const metadata: Metadata = {
  title: "Laadkosten",
  description: "Overzicht en rapportage van laadkosten per vennootschap",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const sessie = await auth();

  return (
    <html lang="nl">
      <body>
        {sessie?.user ? (
          <header className="balk">
            <div className="balk-binnen">
              <a className="merk" href="/">
                Laadkosten
              </a>
              <Navigatie />
              <div className="rechts">
                <span>{sessie.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button className="stil" type="submit">
                    Afmelden
                  </button>
                </form>
              </div>
            </div>
          </header>
        ) : null}
        <main className="omhulsel">{children}</main>
      </body>
    </html>
  );
}
