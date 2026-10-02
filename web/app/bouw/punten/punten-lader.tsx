"use client";

import dynamic from "next/dynamic";

/** Het plan met de punten leest de PDF met pdf.js, en dat hoort enkel in de browser. */
export const PuntenLader = dynamic(() => import("./puntenplan"), {
  ssr: false,
  loading: () => <div className="viewer viewer-leeg">Plan laden…</div>,
});
