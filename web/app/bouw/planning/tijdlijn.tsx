import { dagenTussen, korteDatum, maandnaam } from "@/lib/bouw/kalender";
import { groepeer, standVan, tijdasVan, type Planningsitem } from "@/lib/bouw/planning";

import { Scrollvak } from "./scrollvak";

/**
 * De planning als tijdlijn: per fase een rij met de taken eronder, de
 * mijlpalen als ruit, de deadlines van de keuzes op een eigen rij, en een lijn
 * op vandaag. Links de namen, die blijven staan; rechts de tekening, die
 * zijwaarts scrolt en bij vandaag opent. Dezelfde gegevens staan als lijst
 * onder de tekening.
 */

const RIJ = 26;
const KOP = 36;
const LINKS = 8;
/** Ruimte rechts voor de naam van een aannemer naast de laatste balk. */
const RECHTS = 180;

export interface Markering {
  id: number;
  titel: string;
  datum: string;
  href: string;
}

type Rij = { soort: "item"; item: Planningsitem; fase: boolean } | { soort: "kop"; tekst: string };

const kort = (tekst: string, max: number) => (tekst.length > max ? `${tekst.slice(0, max - 1)}…` : tekst);
const link = (item: Planningsitem) => `/bouw/planning?item=${item.id}#wijzigen`;

export function Tijdlijn({
  items,
  partijnamen,
  deadlines,
  vandaag,
}: {
  items: Planningsitem[];
  partijnamen: Map<number, string>;
  deadlines: Markering[];
  vandaag: string;
}) {
  const rijen: Rij[] = [];
  for (const groep of groepeer(items)) {
    if (groep.fase) rijen.push({ soort: "item", item: groep.fase, fase: true });
    else rijen.push({ soort: "kop", tekst: groep.items.every((item) => item.soort === "mijlpaal") ? "Mijlpalen" : "Zonder fase" });
    for (const item of groep.items) rijen.push({ soort: "item", item, fase: false });
  }

  const as = tijdasVan(
    [...items.flatMap((item) => [item.begindatum, item.einddatum ?? item.begindatum]), ...deadlines.map((d) => d.datum)],
    vandaag,
  );
  // Ongeveer 90 pixels per maand; een lange planning wat dichter.
  const px = as.dagen > 730 ? 2 : 3;
  const x = (datum: string) => LINKS + dagenTussen(as.begin, datum) * px;
  const aantalRijen = rijen.length + (deadlines.length > 0 ? 1 : 0);
  const hoogte = KOP + aantalRijen * RIJ + 6;
  const breedte = LINKS + as.dagen * px + RECHTS;
  const y = (rij: number) => KOP + rij * RIJ;
  const opVandaag = vandaag >= as.begin && vandaag <= as.einde;

  return (
    <div className="tijdlijn">
      <div className="tl-namen" style={{ paddingTop: KOP }}>
        {rijen.map((rij) =>
          rij.soort === "kop" ? (
            <div key="los" className="tl-naam fase" style={{ height: RIJ }}>
              {rij.tekst}
            </div>
          ) : (
            <a
              key={rij.item.id}
              href={link(rij.item)}
              className={`tl-naam${rij.fase ? " fase" : ""}`}
              style={{ height: RIJ }}
              title={rij.item.titel}
            >
              {rij.item.soort === "mijlpaal" ? "◆ " : ""}
              {rij.item.titel}
            </a>
          ),
        )}
        {deadlines.length > 0 ? (
          <div className="tl-naam fase" style={{ height: RIJ }}>
            Keuzes: beslissen
          </div>
        ) : null}
      </div>

      <Scrollvak className="tl-vak" start={opVandaag ? x(vandaag) - 120 : 0}>
        <svg
          width={breedte}
          height={hoogte}
          viewBox={`0 0 ${breedte} ${hoogte}`}
          role="img"
          aria-label={`Tijdlijn van ${korteDatum(as.begin)} tot ${korteDatum(as.einde)}, met ${items.length} fasen, taken en mijlpalen`}
        >
          {as.maanden.map((maand, index) => {
            const volgende = as.maanden[index + 1];
            const eind = volgende ? x(volgende) : x(as.einde) + px;
            const jaar = index === 0 || maand.slice(5, 7) === "01";
            return (
              <g key={maand}>
                {index % 2 === 1 ? (
                  <rect className="tl-maand" x={x(maand)} y={KOP - 6} width={eind - x(maand)} height={hoogte - KOP + 6} />
                ) : null}
                <line className="tl-raster" x1={x(maand)} x2={x(maand)} y1={4} y2={hoogte} />
                <text className="tl-maandnaam" x={x(maand) + 4} y={16}>
                  {maandnaam(maand)}
                </text>
                {jaar ? (
                  <text className="tl-jaar" x={x(maand) + 4} y={29}>
                    {maand.slice(0, 4)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {rijen.map((rij, index) => {
            if (rij.soort === "kop") return null;
            const { item, fase } = rij;
            const boven = y(index);
            const begin = x(item.begindatum);
            const breedteBalk = (dagenTussen(item.begindatum, item.einddatum ?? item.begindatum) + 1) * px;
            const partij = item.partij_id ? partijnamen.get(item.partij_id) : undefined;
            const periode =
              item.einddatum && item.einddatum !== item.begindatum
                ? `${korteDatum(item.begindatum)} – ${korteDatum(item.einddatum)}`
                : korteDatum(item.begindatum);
            const stand = standVan(item, vandaag);
            return (
              <a key={item.id} href={link(item)}>
                <title>{[item.titel, periode, partij].filter(Boolean).join(" · ")}</title>
                {item.soort === "mijlpaal" ? (
                  <path className={`tl-mijlpaal ${stand}`} d={`M ${begin + px / 2} ${boven + 5} l 8 8 l -8 8 l -8 -8 z`} />
                ) : (
                  <rect
                    className={fase ? "tl-fase" : `tl-balk ${stand}`}
                    x={begin}
                    y={fase ? boven + 9 : boven + 6}
                    width={breedteBalk}
                    height={fase ? 8 : RIJ - 12}
                    rx={3}
                  />
                )}
                {partij && !fase && item.soort !== "mijlpaal" ? (
                  <text className="tl-partij" x={begin + breedteBalk + 6} y={boven + RIJ / 2 + 4}>
                    {kort(partij, 26)}
                  </text>
                ) : null}
              </a>
            );
          })}

          {deadlines.map((deadline) => (
            <a key={deadline.id} href={deadline.href}>
              {/* Eén tekst: React verwacht in een title geen losse stukken. */}
              <title>{`${deadline.titel}: beslissen tegen ${korteDatum(deadline.datum)}`}</title>
              <circle className="tl-deadline" cx={x(deadline.datum) + px / 2} cy={y(rijen.length) + RIJ / 2} r={6} />
            </a>
          ))}

          {opVandaag ? (
            <line className="tl-vandaag" x1={x(vandaag) + px / 2} x2={x(vandaag) + px / 2} y1={KOP - 6} y2={hoogte} />
          ) : null}
        </svg>
      </Scrollvak>
    </div>
  );
}
