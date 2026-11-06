import type { ReactNode } from "react";

import { GeenToegang } from "@/components/geen-toegang";
import { magHuishoudenZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

/**
 * Huishouden: voor wie gekoppeld is aan Jan of Sandra. Deze controle is er
 * voor wie hier toevallig belandt; elke actie kijkt het zelf nog eens na.
 */
export default async function Huishoudenlayout({ children }: { children: ReactNode }) {
  const ik = await vereistGebruiker();
  if (!magHuishoudenZien(ik)) return <GeenToegang wat="Huishouden" voor="Jan en Sandra" />;

  return <>{children}</>;
}
