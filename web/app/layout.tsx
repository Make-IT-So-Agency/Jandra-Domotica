import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { Zijmenu } from "@/components/zijmenu";
import { lijstHuizen } from "@/lib/bouw/huizen";
import { menuVoor } from "@/lib/navigatie";
import { ROLNAMEN, magBouwZien } from "@/lib/rollen";
import { huidigeGebruiker } from "@/lib/toegang";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jandra", template: "%s · Jandra" },
  description: "Automatisering voor ons gezin: laadkosten, opvang en ons vastgoed",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Geen maximumschaal: inzoomen moet mogelijk blijven voor wie dat nodig heeft.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Kan mislukken als de databank onbereikbaar is; het menu mag daar niet de
  // hele app voor onderuit halen.
  const gebruiker = await huidigeGebruiker().catch(() => null);
  // De actieve huizen onder Vastgoed: enkel het nummer, de naam en het soort gaan naar de browser.
  const huizen =
    gebruiker && magBouwZien(gebruiker)
      ? (await lijstHuizen().catch(() => [])).map(({ id, naam, soort }) => ({ id, naam, soort }))
      : [];

  return (
    <html lang="nl">
      <body>
        {gebruiker ? (
          <Zijmenu
            menu={menuVoor(gebruiker, huizen)}
            wie={gebruiker.email}
            rol={ROLNAMEN[gebruiker.rol]}
            afmelden={
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
            }
          >
            {children}
          </Zijmenu>
        ) : (
          <main className="omhulsel">{children}</main>
        )}
      </body>
    </html>
  );
}
