"use client";

import dynamic from "next/dynamic";

/** Alles omzetten leest de PDF's met pdf.js, en dat hoort enkel in de browser. */
export const ReeksLader = dynamic(() => import("./reeks"), {
  ssr: false,
  loading: () => <div className="melding info">De grondplannen laden…</div>,
});
