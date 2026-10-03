import type { ReactNode } from "react";

import { GeenToegang } from "@/components/geen-toegang";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

/**
 * De pagina's van Bouw staan in het zijmenu, onder Vastgoed. Deze controle
 * is er voor wie hier toevallig belandt; de echte beveiliging zit in elke
 * pagina en elke actie apart, want een layout wordt bij het navigeren niet
 * altijd opnieuw gerenderd.
 */
export default async function Bouwlayout({ children }: { children: ReactNode }) {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  return <>{children}</>;
}
