import type { ReactNode } from "react";

import { GeenToegang } from "@/components/geen-toegang";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

/**
 * Vastgoed: de huizen en hun pagina's, en de bot. Deze controle is er voor
 * wie hier toevallig belandt; de echte beveiliging zit in elke pagina en elke
 * actie apart, want een layout wordt bij het navigeren niet altijd opnieuw
 * gerenderd.
 */
export default async function Vastgoedlayout({ children }: { children: ReactNode }) {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Vastgoed" />;

  return <>{children}</>;
}
