import type { Tekening, Tekenstuk } from "@/lib/bouw/technieken/schema";

/**
 * Een tekening van lib/bouw/technieken/schema.ts als SVG: het eendraadschema
 * en het situatieschema. Altijd zwart op wit, ook in het donker: zo leest het
 * zoals op papier. De PDF tekent dezelfde stukken (technieken/pdf.tsx).
 */

const punten = (lijst: readonly [number, number][]) => lijst.map(([x, y]) => `${x},${y}`).join(" ");

function Stuk({ stuk }: { stuk: Tekenstuk }) {
  switch (stuk.soort) {
    case "lijn":
      return (
        <polyline
          points={punten(stuk.punten)}
          fill="none"
          stroke={stuk.kleur ?? "#111827"}
          strokeWidth={stuk.dikte ?? 1}
          strokeDasharray={stuk.streep ? "4 3" : undefined}
          strokeLinejoin="round"
        />
      );
    case "vlak":
      return <polygon points={punten(stuk.punten)} fill={stuk.vul} stroke={stuk.lijn ?? "none"} strokeWidth={1} />;
    case "rechthoek":
      return <rect x={stuk.x} y={stuk.y} width={stuk.breedte} height={stuk.hoogte} fill={stuk.vul ?? "none"} stroke={stuk.lijn ?? "none"} strokeWidth={1} />;
    case "cirkel":
      return <circle cx={stuk.x} cy={stuk.y} r={stuk.r} fill={stuk.vul ?? "none"} stroke={stuk.lijn ?? "none"} strokeWidth={1} />;
    case "tekst":
      return (
        <text x={stuk.x} y={stuk.y} fontSize={stuk.grootte} textAnchor={stuk.anker ?? "start"} fontWeight={stuk.vet ? 700 : 400} fill={stuk.kleur ?? "#111827"}>
          {stuk.tekst}
        </text>
      );
  }
}

export function Tekeningsvg({ tekening, titel }: { tekening: Tekening; titel: string }) {
  return (
    <svg
      className="tekening"
      viewBox={`0 0 ${tekening.breedte} ${tekening.hoogte}`}
      width={tekening.breedte}
      height={tekening.hoogte}
      role="img"
      aria-label={titel}
      fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
    >
      <rect x={0} y={0} width={tekening.breedte} height={tekening.hoogte} fill="#ffffff" />
      {tekening.stukken.map((stuk, i) => (
        <Stuk key={i} stuk={stuk} />
      ))}
    </svg>
  );
}
