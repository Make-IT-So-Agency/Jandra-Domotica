"use client";

import dynamic from "next/dynamic";

/**
 * Laadt het inlezen van een dossier enkel in de browser: het leest de PDF met
 * pdf.js, en dat hoort niet op de server.
 */
export const DossierLader = dynamic(() => import("./dossier"), {
  ssr: false,
  loading: () => (
    <div className="kaart">
      <p className="hulp">Laden…</p>
    </div>
  ),
});
