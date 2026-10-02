"use client";

import dynamic from "next/dynamic";

/** Het nakijkscherm leest de PDF met pdf.js, en dat hoort enkel in de browser. */
export const NakijkenLader = dynamic(() => import("./nakijken"), {
  ssr: false,
  loading: () => <div className="viewer viewer-leeg">Plan laden…</div>,
});
