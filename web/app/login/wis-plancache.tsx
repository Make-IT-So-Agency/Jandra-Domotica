"use client";

import { useEffect } from "react";

import { wisPlancache } from "@/lib/bouw/plancache";

/**
 * Wie op de loginpagina staat, is afgemeld. De plannen van het huis die de
 * browser bewaarde, horen dan niet meer op dit toestel te staan.
 */
export function WisPlancache() {
  useEffect(() => {
    void wisPlancache();
  }, []);
  return null;
}
