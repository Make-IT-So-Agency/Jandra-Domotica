import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { Navigatie } from "@/components/navigatie";
import { zichtbarePaginas } from "@/lib/navigatie";
import { ROLNAMEN } from "@/lib/rollen";
import { huidigeGebruiker } from "@/lib/toegang";

import "./globals.css";

export const metadata: Metadata = {
  title: "Laadkosten",
  description: "Overzicht en rapportage van laadkosten per vennootschap",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Geen maximumschaal: inzoomen moet mogelijk blijven voor wie dat nodig heeft.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Kan mislukken als de databank onbereikbaar is; de balk mag daar niet de
  // hele app voor onderuit halen.
  const gebruiker = await huidigeGebruiker().catch(() => null);

  return (
    <html lang="nl">
      <body>
        {gebruiker ? (
          <header className="balk">
            <div className="balk-binnen">
              <a className="merk" href="/">
                Laadkosten
              </a>
              <Navigatie paginas={zichtbarePaginas(gebruiker)} />
              <div className="rechts">
                <span>
                  {gebruiker.email}
                  <span className="hulp"> · {ROLNAMEN[gebruiker.rol]}</span>
                </span>
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
