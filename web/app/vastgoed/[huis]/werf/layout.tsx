import type { ReactNode } from "react";

import { Onderdeelpoort } from "@/components/bouw/onderdeelpoort";

/** Een bestaand huis heeft geen werf: dan uitleg in plaats van de pagina. */
export default function Werflayout({ children, params }: { children: ReactNode; params: Promise<{ huis: string }> }) {
  return (
    <Onderdeelpoort params={params} onderdeel="werf">
      {children}
    </Onderdeelpoort>
  );
}
