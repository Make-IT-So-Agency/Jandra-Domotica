import { tredelijnen } from "@/lib/bouw/drie/trappen";
import { kaderVan, middenVan } from "@/lib/bouw/omzetting/geometrie";
import type { Kader, Trapdeel, Xy } from "@/lib/bouw/omzetting/types";
import type { Ruimte } from "@/lib/bouw/types";

function pad(ringen: Xy[][]): string {
  return ringen.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join("L")}Z`).join("");
}

const m2 = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m²`;

/**
 * De ruimtes van een verdieping als tekening, in meter. Alle verdiepingen van
 * een gebouw krijgen hetzelfde kader, zodat ze onder elkaar op dezelfde
 * plaats staan. Gewone SVG, zonder JavaScript: ook op de gsm.
 */
export function Ruimteplan({
  ruimtes,
  kader,
  punten = [],
  trappen = [],
}: {
  ruimtes: Ruimte[];
  kader: Kader;
  /** De punten op deze verdieping, als bolletjes in de kleur van hun categorie. */
  punten?: { id: number; x_m: number; y_m: number; kleur: string; naam: string }[];
  /** De trappen van het plan: die hier beginnen met hun treden, die van de verdieping eronder als trapgat in streepjes. */
  trappen?: { delen: Trapdeel[]; vanOnder: boolean }[];
}) {
  const marge = 0.4;
  const x = kader.x0 - marge;
  const y = kader.y0 - marge;
  const breedte = kader.x1 - kader.x0 + 2 * marge;
  const hoogte = kader.y1 - kader.y0 + 2 * marge;
  return (
    <svg
      className="ruimteplan"
      viewBox={`${x} ${y} ${breedte} ${hoogte}`}
      role="img"
      aria-label={`Tekening met ${ruimtes.length === 1 ? "1 ruimte" : `${ruimtes.length} ruimtes`}`}
    >
      {ruimtes.map((ruimte) => (
        <path
          key={ruimte.id}
          d={pad(ruimte.veelhoek)}
          fillRule="evenodd"
          className={`ruimteplan-vlak soort-${ruimte.soort}`}
        >
          {/* Eén tekst: React vergelijkt een <title> met meer stukken anders dan de server hem schreef. */}
          <title>{`${ruimte.naam}, ${m2(ruimte.oppervlakte_m2)}`}</title>
        </path>
      ))}
      {trappen.map((trap, t) => (
        <g key={`t${t}`} className={trap.vanOnder ? "ruimteplan-trapgat" : "ruimteplan-trap"}>
          <title>{trap.vanOnder ? "Trapgat: de trap van de verdieping eronder" : "Trap naar boven"}</title>
          {trap.delen.map((deel, d) => (
            <path key={d} d={pad([deel.hoeken])} />
          ))}
          {trap.vanOnder
            ? null
            : trap.delen.flatMap((deel, d) =>
                tredelijnen(deel).map(([p, q], k) => <line key={`${d}-${k}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />),
              )}
        </g>
      ))}
      {punten.map((punt) => (
        <circle key={`p${punt.id}`} cx={punt.x_m} cy={punt.y_m} r={0.11} fill={punt.kleur} stroke="#ffffff" strokeWidth={0.03}>
          <title>{punt.naam}</title>
        </circle>
      ))}
      {ruimtes.map((ruimte) => {
        const [mx, my] = middenVan(ruimte.veelhoek);
        // Een kleine of smalle ruimte krijgt een kleinere letter, zodat de naam
        // erin past; een letter is ongeveer 0,55 keer zo breed als hoog.
        const kader = kaderVan(ruimte.veelhoek[0] ?? []);
        const pastIn = ((kader.x1 - kader.x0) * 0.9) / Math.max(4, ruimte.naam.length * 0.55);
        const grootte = Math.max(0.1, Math.min(0.34, Math.sqrt(ruimte.oppervlakte_m2) * 0.08, pastIn));
        return (
          <text key={ruimte.id} x={mx} y={my} fontSize={grootte} className="ruimteplan-naam">
            <tspan x={mx}>{ruimte.naam}</tspan>
            <tspan x={mx} dy={grootte * 1.25} className="ruimteplan-maat">
              {m2(ruimte.oppervlakte_m2)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
