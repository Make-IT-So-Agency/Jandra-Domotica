import type { ReactNode } from "react";

import { Onderdeelpoort } from "@/components/bouw/onderdeelpoort";

/** Een bestaand huis heeft geen planning: dan uitleg in plaats van de pagina. */
export default function Planninglayout({ children, params }: { children: ReactNode; params: Promise<{ huis: string }> }) {
  return (
    <Onderdeelpoort params={params} onderdeel="planning">
      {children}
    </Onderdeelpoort>
  );
}
