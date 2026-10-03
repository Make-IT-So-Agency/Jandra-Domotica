import { maandnaam } from "@/lib/bouw/kalender";
import { euroBedrag, kortBedrag, mooieGrens, type Kasmaand } from "@/lib/bouw/geld";

const HOOGTE = 200;
const BOVEN = 12;
const ONDER = 40;
const AS = 52;
/** De breedte van een maand: minstens zoveel, anders schuift de grafiek opzij; hoogstens zoveel, anders worden de staven balken. */
const MIN_MAAND = 40;
const MAX_MAAND = 96;

/**
 * Per maand een gestapelde staaf: wat betaald is, wat vervalt en wat volgens
 * de planning nog komt. Een eigen SVG, zoals de tijdlijn: geen bibliotheek
 * nodig voor een paar rechthoeken.
 *
 * De as staat in een eigen smal vak. De staven staan in procenten, zodat ze
 * de breedte vullen zonder dat de tekst mee vergroot.
 */
export function Kasgrafiek({ maanden, vandaag }: { maanden: Kasmaand[]; vandaag: string }) {
  const nu = vandaag.slice(0, 7);
  const delen = (maand: Kasmaand) => [Math.max(0, maand.betaald), Math.max(0, maand.teBetalen), Math.max(0, maand.gepland)];
  const grens = mooieGrens(Math.max(...maanden.map((maand) => delen(maand).reduce((a, b) => a + b, 0))));
  const y = (bedrag: number) => BOVEN + HOOGTE - (bedrag / grens) * HOOGTE;
  const lijnen = [0, 0.25, 0.5, 0.75, 1].map((deel) => deel * grens);
  const kolom = 100 / maanden.length;
  const procent = (waarde: number) => `${Math.round(waarde * 1000) / 1000}%`;
  const totaleHoogte = BOVEN + HOOGTE + ONDER;

  return (
    <div className="kasgrafiek">
      <div className="kas-vlak">
        <svg width={AS} height={totaleHoogte} className="kas-as-vak" aria-hidden="true">
          {lijnen.map((waarde) => (
            <text key={waarde} x={AS - 6} y={y(waarde) + 4} textAnchor="end" className="kas-as">
              {kortBedrag(waarde)}
            </text>
          ))}
        </svg>
        <svg
          height={totaleHoogte}
          className="kas-staven"
          style={{ minWidth: maanden.length * MIN_MAAND, maxWidth: maanden.length * MAX_MAAND }}
          role="img"
          aria-label="Uitgaven per maand"
        >
          {lijnen.map((waarde) => (
            <line key={waarde} x1="0" x2="100%" y1={y(waarde)} y2={y(waarde)} className="kas-raster" />
          ))}
          {maanden.map((maand, index) => {
            const [betaald, teBetalen, gepland] = delen(maand);
            const stukken = [
              { klasse: "kas-betaald", van: 0, tot: betaald },
              { klasse: "kas-te-betalen", van: betaald, tot: betaald + teBetalen },
              { klasse: "kas-gepland", van: betaald + teBetalen, tot: betaald + teBetalen + gepland },
            ];
            const midden = procent((index + 0.5) * kolom);
            return (
              <g key={maand.maand}>
                {maand.maand === nu ? (
                  <rect x={procent(index * kolom)} y={BOVEN} width={procent(kolom)} height={HOOGTE} className="kas-nu" />
                ) : null}
                {stukken.map((stuk) =>
                  stuk.tot > stuk.van ? (
                    <rect
                      key={stuk.klasse}
                      x={procent((index + 0.18) * kolom)}
                      width={procent(kolom * 0.64)}
                      y={y(stuk.tot)}
                      height={Math.max(1, y(stuk.van) - y(stuk.tot))}
                      className={stuk.klasse}
                    />
                  ) : null,
                )}
                <title>
                  {`${maandnaam(`${maand.maand}-01`)} ${maand.maand.slice(0, 4)}: betaald ${euroBedrag(maand.betaald)}, te betalen ${euroBedrag(maand.teBetalen)}, gepland ${euroBedrag(maand.gepland)}`}
                </title>
                <text x={midden} y={BOVEN + HOOGTE + 16} textAnchor="middle" className="kas-as">
                  {maandnaam(`${maand.maand}-01`)}
                </text>
                {maand.maand.endsWith("-01") || index === 0 ? (
                  <text x={midden} y={BOVEN + HOOGTE + 32} textAnchor="middle" className="kas-as">
                    {maand.maand.slice(0, 4)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="kas-legende">
        <span className="kas-blokje kas-betaald" /> betaald
        <span className="kas-blokje kas-te-betalen" /> te betalen
        <span className="kas-blokje kas-gepland" /> volgens de planning
      </p>
    </div>
  );
}
