"use client";

import dynamic from "next/dynamic";

/** Het plan met de leidingen leest de PDF met pdf.js, en dat hoort enkel in de browser. */
export const LeidingenLader = dynamic(() => import("./leidingenplan"), {
  ssr: false,
  loading: () => <div className="viewer viewer-leeg">Plan laden…</div>,
});
