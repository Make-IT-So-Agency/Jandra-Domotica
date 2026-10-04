"use client";

import dynamic from "next/dynamic";

/** Het plan met de muren leest de PDF met pdf.js, en dat hoort enkel in de browser. */
export const VerbeterLader = dynamic(() => import("./verbeterplan"), {
  ssr: false,
  loading: () => <div className="viewer viewer-leeg">Plan laden…</div>,
});
