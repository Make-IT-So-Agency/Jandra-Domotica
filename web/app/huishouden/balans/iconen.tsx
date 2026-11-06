/**
 * De iconen van De balans, letterlijk uit het prototype (docs/STIJLGIDS.md,
 * bijlage B): lijnen van 2 op een raster van 24, ronde uiteinden. De tekst
 * staat altijd in aria-label en title van de knop of badge eromheen.
 */

const basis = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function Vuilbak() {
  return (
    <svg {...basis}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function Potlood() {
  return (
    <svg {...basis}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function Doorhaling() {
  return (
    <svg {...basis}>
      <path d="M4 12h16" />
      <path d="M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3 0 1.2.7 2 2 2.6" />
      <path d="M8 17.5c1 1.5 2.4 2 4 2 2.5 0 4-1.3 4-3 0-.9-.4-1.6-1.1-2.1" />
    </svg>
  );
}

export function Terugdraaien() {
  return (
    <svg {...basis}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}

export function Dobbelsteen() {
  return (
    <svg {...basis}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="15" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
      <circle cx="9" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}
