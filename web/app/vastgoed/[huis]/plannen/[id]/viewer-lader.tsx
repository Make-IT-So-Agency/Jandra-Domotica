"use client";

import dynamic from "next/dynamic";

/**
 * Laadt de viewer enkel in de browser. pdf.js hoort niet op de server, en
 * dynamic(..., { ssr: false }) mag in Next 15 enkel vanuit een clientbestand.
 */
export const ViewerLader = dynamic(() => import("./viewer"), {
  ssr: false,
  loading: () => <div className="viewer viewer-leeg">Plan laden…</div>,
});
