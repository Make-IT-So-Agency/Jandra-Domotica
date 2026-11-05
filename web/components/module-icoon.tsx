import type { Icoon } from "@/lib/navigatie";

/** De tekening van elk icoon, op een raster van 24 bij 24, in lijnen. */
const TEKENINGEN: Record<Icoon, React.ReactNode> = {
  stekker: (
    <>
      <path d="M9 2v5M15 2v5" />
      <path d="M6 7h12v4a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </>
  ),
  huis: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  mensen: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2a5 5 0 0 1 5.5 4.8" />
    </>
  ),
  mand: (
    <>
      <path d="M3 10h18l-2 10H5z" />
      <path d="M8 10l4-6 4 6" />
      <path d="M9.5 14v3M14.5 14v3" />
    </>
  ),
  kalender: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
};

/** Het icoon van een module in de modulebalk; de tekst ernaast zegt wat het is. */
export function ModuleIcoon({ icoon }: { icoon: Icoon }) {
  return (
    <svg
      className="module-icoon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TEKENINGEN[icoon]}
    </svg>
  );
}
