"use client";

import { useEffect, useMemo, useState } from "react";

import { Lagenkeuze, useLagen } from "@/components/bouw/lagen";
import type { Punt as Schermpunt } from "@/lib/bouw/beeld";
import { isAan, leidinglagen } from "@/lib/bouw/drie/lagen";
import {
  controleerLeiding,
  kleefLeiding,
  LEIDINGSOORTEN,
  leidingsoort,
  lengteVan,
  LIGGINGNAMEN,
  metertekst,
  MUURHOOGTE,
  oppervlakteVan,
  totalen,
  type Leiding,
  type Ligging,
  type Nieuweleiding,
} from "@/lib/bouw/leidingen";
import { afstandTotSegment, binnen, kaderVan, naarHuis, naarPagina, type Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { CATEGORIEKLEUREN, soortVan, type Ruimtevorm } from "@/lib/bouw/punten";

import { usePlanblad } from "../../plannen/[id]/planblad";
import { Planvlak } from "../../plannen/[id]/planvlak";
import { verwijderLeidingActie, voegLeidingToeActie, wijzigLeidingActie } from "./acties";

export interface Leidinggegevens {
  verdieping: { id: number; naam: string };
  versie: { id: number; bestandId: number; pagina: number; kalibratie: Kalibratie };
  ruimtes: Ruimtevorm[];
  /** De punten van de verdieping: een leiding kleeft eraan. */
  punten: { id: number; soort: string; x: number; y: number }[];
  leidingen: Leiding[];
  /** De andere verdiepingen van het gebouw, voor een stijgleiding. */
  andere: { id: number; naam: string; volgorde: number }[];
  volgorde: number;
}

type Modus = "kijken" | "tekenen";

/** Zo ziet de lijn eruit, naar waar ze ligt: vol in de vloer, streepjes in de muur, stippen aan het plafond. */
function streepjes(ligging: Ligging, zoom: number): string | undefined {
  const z = (waarden: number[]) => waarden.map((w) => (w / zoom).toFixed(2)).join(" ");
  if (ligging === "muur") return z([7, 4]);
  if (ligging === "plafond") return z([2, 4]);
  if (ligging === "grond") return z([10, 3, 2, 3]);
  return undefined;
}

function pad(ringen: Xy[][], k: Kalibratie): string {
  return ringen
    .map((ring) => `M${ring.map((p) => naarPagina(p, k).map((w) => w.toFixed(1)).join(",")).join("L")}Z`)
    .join("");
}

/**
 * Leidingen tekenen op het plan: kies een soort, tik punt na punt, en
 * bewaar. Een punt kleeft aan een punt in de buurt (een kraan, een afvoer)
 * of aan een andere leiding, en anders aan een rechte hoek met het vorige.
 * Elke leiding wordt meteen bewaard, in meter. Op een laptop of tablet.
 */
export default function Leidingenplan({ huisId, gegevens }: { huisId: number; gegevens: Leidinggegevens }) {
  const { verdieping, versie, ruimtes, punten, andere } = gegevens;
  const { blad, fout } = usePlanblad(huisId, versie.id, versie.bestandId, versie.pagina);
  const k = versie.kalibratie;

  const [klein, setKlein] = useState(false);
  const [leidingen, setLeidingen] = useState<Leiding[]>(gegevens.leidingen);
  const [modus, setModus] = useState<Modus>("kijken");
  const [soort, setSoort] = useState("water_koud");
  const [ligging, setLigging] = useState<Ligging>("vloer");
  // Een stijgleiding loopt standaard naar de verdieping erboven.
  const [tot, setTot] = useState<number | null>(
    () => [...andere].sort((a, b) => a.volgorde - b.volgorde).find((v) => v.volgorde > gegevens.volgorde)?.id ?? andere[0]?.id ?? null,
  );
  // De punten van de leiding die getekend wordt, in meter.
  const [nieuw, setNieuw] = useState<Xy[]>([]);
  const [gekozen, setGekozen] = useState<number | null>(null);
  const [melding, setMelding] = useState<{ soort: "fout" | "info"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    const vraag = window.matchMedia("(max-width: 599px)");
    const zet = () => setKlein(vraag.matches);
    zet();
    vraag.addEventListener("change", zet);
    return () => vraag.removeEventListener("change", zet);
  }, []);

  // Wat er te zien is: een laag per soort, zoals in 3D (de browser onthoudt het).
  const [lagen, zetLagen] = useLagen();
  const lagengroep = useMemo(
    () => leidinglagen(LEIDINGSOORTEN.filter((s) => leidingen.some((l) => l.soort === s.soort))),
    [leidingen],
  );
  const zichtbaar = leidingen.filter((l) => isAan(lagen, `leidingen:${l.soort}`));
  const gekozenLeiding = leidingen.find((l) => l.id === gekozen) ?? null;
  const sommen = useMemo(() => totalen(leidingen), [leidingen]);

  // Bij het begin het gebouw in beeld: de ruimtes, met wat marge.
  const start = useMemo(() => {
    const hoeken = ruimtes.flatMap((r) => (r.veelhoek[0] ?? []).map((p) => naarPagina(p, k)));
    if (hoeken.length === 0) return null;
    const kader = kaderVan(hoeken);
    const marge = 1.5 / k.meterPerPunt;
    return { x: kader.x0 - marge, y: kader.y0 - marge, breedte: kader.x1 - kader.x0 + 2 * marge, hoogte: kader.y1 - kader.y0 + 2 * marge };
  }, [ruimtes, k]);

  /** Een leiding bewaren: een nieuwe, of een bestaande met wijzigingen. */
  async function bewaar(leiding: Nieuweleiding, id?: number): Promise<boolean> {
    const nagekeken = controleerLeiding(leiding);
    if (!nagekeken.ok) {
      setMelding({ soort: "fout", tekst: nagekeken.melding });
      return false;
    }
    setBezig(true);
    const uitkomst =
      id === undefined
        ? await voegLeidingToeActie(huisId, { verdiepingId: verdieping.id, leiding: nagekeken.data }).catch(() => null)
        : await wijzigLeidingActie(huisId, { id, leiding: nagekeken.data }).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) {
      setMelding({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
      return false;
    }
    setLeidingen((huidig) => (id === undefined ? [...huidig, uitkomst.data] : huidig.map((l) => (l.id === id ? uitkomst.data : l))));
    return true;
  }

  /** De getekende leiding bewaren, en verder tekenen met dezelfde soort. */
  async function bewaarNieuw(lijn: Xy[]) {
    const gelukt = await bewaar({
      soort,
      punten: lijn,
      ligging,
      hoogte: ligging === "muur" ? leesHoogte() : null,
      diameter: leidingsoort(soort)?.diameter ?? 20,
      totVerdiepingId: ligging === "stijg" ? tot : null,
      label: null,
    });
    if (gelukt) {
      setNieuw([]);
      setMelding({ soort: "info", tekst: ligging === "stijg" ? "Stijgleiding bewaard." : "Leiding bewaard. Tik het begin van de volgende." });
    }
  }

  const [hoogtetekst, setHoogtetekst] = useState(String(MUURHOOGTE).replace(".", ","));
  const leesHoogte = () => {
    const waarde = Number(hoogtetekst.replace(",", "."));
    return Number.isFinite(waarde) ? waarde : MUURHOOGTE;
  };

  async function verwijder(leiding: Leiding) {
    if (!window.confirm(`${leidingsoort(leiding.soort)?.naam ?? "Deze leiding"} verwijderen?`)) return;
    setBezig(true);
    const uitkomst = await verwijderLeidingActie(huisId, leiding.id).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) {
      return setMelding({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
    }
    setLeidingen((huidig) => huidig.filter((l) => l.id !== leiding.id));
    setGekozen(null);
  }

  function kiesSoort(nieuweSoort: string) {
    setSoort(nieuweSoort);
    setLigging(leidingsoort(nieuweSoort)?.ligging ?? "vloer");
    setModus("tekenen");
    setNieuw([]);
    setGekozen(null);
    setMelding(null);
  }

  const opTik = (scherm: Schermpunt, zoom: number) => {
    const p: Xy = [scherm.x, scherm.y];
    setMelding(null);
    if (bezig) return;
    if (modus === "tekenen") {
      // Kleven, op de pagina: aan een punt, aan een andere leiding, aan het begin (een zone sluiten), of recht.
      const kandidaten: Xy[] = [
        ...punten.map((q) => naarPagina([q.x, q.y], k)),
        ...zichtbaar.flatMap((l) => l.punten.map((q) => naarPagina(q, k))),
        ...(ligging === "zone" && nieuw.length >= 3 ? [naarPagina(nieuw[0], k)] : []),
      ];
      const vorige = nieuw.at(-1);
      const { punt } = kleefLeiding(p, { vorige: vorige ? naarPagina(vorige, k) : null, kandidaten, straal: 14 / zoom });
      const [x, y] = naarHuis(punt, k);
      const inMeter: Xy = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
      if (ligging === "stijg") return void bewaarNieuw([inMeter]);
      // Een zone sluit je door op haar eerste punt te tikken.
      if (ligging === "zone" && nieuw.length >= 3 && Math.hypot(inMeter[0] - nieuw[0][0], inMeter[1] - nieuw[0][1]) < 0.01) {
        return void bewaarNieuw(nieuw);
      }
      setNieuw((huidig) => [...huidig, inMeter]);
      return;
    }
    // Kijken: de dichtste leiding binnen een kleine afstand op het scherm, of de zone waarin je tikt.
    const straal = 10 / zoom;
    let beste: { id: number; afstand: number } | null = null;
    for (const leiding of zichtbaar) {
      const lijn = leiding.punten.map((q) => naarPagina(q, k));
      let afstand = Infinity;
      if (lijn.length === 1) afstand = Math.hypot(lijn[0][0] - p[0], lijn[0][1] - p[1]);
      for (let i = 1; i < lijn.length; i++) afstand = Math.min(afstand, afstandTotSegment(p, lijn[i - 1], lijn[i]));
      if (leiding.ligging === "zone" && binnen(p, lijn)) afstand = Math.min(afstand, straal * 0.9);
      if (afstand <= straal && (!beste || afstand < beste.afstand)) beste = { id: leiding.id, afstand };
    }
    setGekozen(beste ? beste.id : null);
  };

  if (klein) {
    return (
      <div className="melding let-op">
        Leidingen tekenen gaat op een laptop of tablet. In 3D kan je ze ook op een gsm bekijken.
      </div>
    );
  }
  if (fout) return <div className="melding fout">{fout}</div>;
  if (!blad) {
    return (
      <div className="viewer">
        <div className="viewer-leeg">Plan laden…</div>
      </div>
    );
  }

  const breedte = (diameter: number, zoom: number) => Math.max(2.5 / zoom, diameter / 1000 / k.meterPerPunt);

  const tekenLeiding = (leiding: Pick<Leiding, "soort" | "punten" | "ligging" | "diameter">, zoom: number, extra: { gekozen?: boolean; bezig?: boolean } = {}) => {
    const kleur = leidingsoort(leiding.soort)?.kleur ?? "#6b7280";
    const lijn = leiding.punten.map((q) => naarPagina(q, k));
    const dik = breedte(leiding.diameter, zoom) * (extra.gekozen ? 1.8 : 1);
    if (leiding.ligging === "stijg" && lijn[0]) {
      const r = 7 / zoom;
      return (
        <g>
          <circle cx={lijn[0][0]} cy={lijn[0][1]} r={r} fill="#ffffff" stroke={kleur} strokeWidth={(extra.gekozen ? 3 : 2) / zoom} />
          <path
            d={`M${lijn[0][0]},${lijn[0][1] + r * 0.55}L${lijn[0][0]},${lijn[0][1] - r * 0.55}M${lijn[0][0] - r * 0.4},${lijn[0][1] - r * 0.15}L${lijn[0][0]},${lijn[0][1] - r * 0.55}L${lijn[0][0] + r * 0.4},${lijn[0][1] - r * 0.15}`}
            fill="none"
            stroke={kleur}
            strokeWidth={1.6 / zoom}
          />
        </g>
      );
    }
    const punten = lijn.map((q) => q.map((w) => w.toFixed(1)).join(",")).join(" ");
    return (
      <g>
        {leiding.ligging === "zone" && !extra.bezig ? (
          <polygon points={punten} fill={kleur} fillOpacity={0.22} stroke={kleur} strokeWidth={dik} strokeLinejoin="round" />
        ) : (
          <polyline
            points={punten}
            fill="none"
            stroke={kleur}
            strokeWidth={dik}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={extra.bezig ? `${4 / zoom} ${3 / zoom}` : streepjes(leiding.ligging, zoom)}
          />
        )}
        {extra.gekozen || extra.bezig
          ? lijn.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3.5 / zoom} fill="#ffffff" stroke={kleur} strokeWidth={1.5 / zoom} />)
          : null}
      </g>
    );
  };

  const laag = (zoom: number) => (
    <>
      {ruimtes.map((ruimte) => (
        <path key={ruimte.id} d={pad(ruimte.veelhoek, k)} fillRule="evenodd" className="laag-ruimte licht" />
      ))}
      {punten.map((punt) => {
        const [x, y] = naarPagina([punt.x, punt.y], k);
        return (
          <circle
            key={punt.id}
            cx={x}
            cy={y}
            r={4 / zoom}
            fill={CATEGORIEKLEUREN[soortVan(punt.soort)?.categorie ?? "andere"]}
            fillOpacity={0.55}
            stroke="#ffffff"
            strokeWidth={1 / zoom}
          />
        );
      })}
      {zichtbaar.map((leiding) => (
        <g key={leiding.id}>{tekenLeiding(leiding, zoom, { gekozen: leiding.id === gekozen })}</g>
      ))}
      {nieuw.length > 0 ? tekenLeiding({ soort, punten: nieuw, ligging, diameter: leidingsoort(soort)?.diameter ?? 20 }, zoom, { bezig: true }) : null}
    </>
  );

  const naamSoort = leidingsoort(soort)?.naam.toLowerCase() ?? "leiding";
  const uitleg =
    modus === "tekenen"
      ? ligging === "stijg"
        ? `Tik waar de stijgleiding (${naamSoort}) omhoog gaat.`
        : ligging === "zone"
          ? nieuw.length >= 3
            ? "Tik het volgende punt van de zone, of tik op het eerste punt om ze te sluiten."
            : "Tik de hoeken van de zone met vloerverwarming, een voor een."
          : nieuw.length === 0
            ? `Tik het begin van de leiding (${naamSoort}). Een punt kleeft aan een kraan, een afvoer of een andere leiding.`
            : "Tik het volgende punt; recht of schuin op 45° kleeft. Bewaar als de leiding af is."
      : "Tik op een leiding om ze te wijzigen.";

  return (
    <div className="omzetten">
      <div>
        <Planvlak
          blad={blad}
          laag={laag}
          opTik={opTik}
          klasse={modus === "kijken" ? undefined : "tikken"}
          start={start}
          info={uitleg}
          label="Het plan met de leidingen"
        />
      </div>

      <div className="omzetten-zijbalk">
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}

        {gekozenLeiding ? (
          <Leidingformulier
            key={gekozenLeiding.id}
            leiding={gekozenLeiding}
            andere={andere}
            bezig={bezig}
            opBewaren={(wijziging) => bewaar({ ...gekozenLeiding, ...wijziging }, gekozenLeiding.id)}
            opVerwijderen={() => void verwijder(gekozenLeiding)}
            opSluiten={() => setGekozen(null)}
          />
        ) : null}

        <section className="kaart">
          <h3>Leiding tekenen</h3>
          <div className="palet-knoppen">
            {LEIDINGSOORTEN.map((s) => (
              <button
                key={s.soort}
                type="button"
                className={`stil palet-knop${modus === "tekenen" && soort === s.soort ? " gekozen" : ""}`}
                onClick={() => kiesSoort(s.soort)}
              >
                <span className="leidingstaal" style={{ background: s.kleur }} />
                {s.naam}
              </button>
            ))}
          </div>
          {modus === "tekenen" ? (
            <>
              <div className="veldenrij" style={{ marginTop: 10 }}>
                <div>
                  <label htmlFor="leiding-ligging">Ligt</label>
                  <select
                    id="leiding-ligging"
                    value={ligging}
                    onChange={(g) => {
                      setLigging(g.currentTarget.value as Ligging);
                      setNieuw([]);
                    }}
                  >
                    {(soort === "vloerverwarming" ? (["zone", "vloer"] as const) : (["vloer", "muur", "plafond", "grond", "stijg"] as const)).map((l) => (
                      <option key={l} value={l}>
                        {LIGGINGNAMEN[l]}
                      </option>
                    ))}
                  </select>
                </div>
                {ligging === "muur" ? (
                  <div>
                    <label htmlFor="leiding-hoogte">Hoogte (m)</label>
                    <input id="leiding-hoogte" inputMode="decimal" value={hoogtetekst} onChange={(g) => setHoogtetekst(g.currentTarget.value)} />
                  </div>
                ) : null}
                {ligging === "stijg" ? (
                  <div>
                    <label htmlFor="leiding-tot">Tot</label>
                    {andere.length > 0 ? (
                      <select id="leiding-tot" value={tot ?? ""} onChange={(g) => setTot(Number(g.currentTarget.value))}>
                        {andere.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.naam}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="hulp">Dit gebouw heeft geen andere verdieping.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="knoppenrij">
                {ligging !== "stijg" ? (
                  <button
                    type="button"
                    disabled={bezig || nieuw.length < (ligging === "zone" ? 3 : 2)}
                    onClick={() => void bewaarNieuw(nieuw)}
                  >
                    {ligging === "zone" ? "Zone bewaren" : "Leiding bewaren"}
                  </button>
                ) : null}
                {nieuw.length > 0 ? (
                  <>
                    <button type="button" className="stil" onClick={() => setNieuw((huidig) => huidig.slice(0, -1))}>
                      Laatste punt weg
                    </button>
                    <button type="button" className="stil" onClick={() => setNieuw([])}>
                      Afbreken
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="stil"
                  onClick={() => {
                    setModus("kijken");
                    setNieuw([]);
                  }}
                >
                  Stoppen met tekenen
                </button>
              </div>
            </>
          ) : null}
          <p className="hulp" style={{ marginTop: 8 }}>
            Volle lijn: in de vloer. Streepjes: in de muur. Stippen: aan het plafond. Streep en stip: in de grond.
          </p>
        </section>

        {lagengroep.lagen.length > 1 ? (
          <section className="kaart">
            <h3>Lagen</h3>
            <Lagenkeuze groepen={[lagengroep]} stand={lagen} zet={zetLagen} />
          </section>
        ) : null}

        <section className="kaart">
          <h3>Op {verdieping.naam.toLowerCase()}</h3>
          {sommen.length === 0 ? (
            <p className="leeg">Nog geen leidingen.</p>
          ) : (
            <ul className="wijzigingen">
              {sommen.map((t) => (
                <li key={t.soort}>
                  <span className="leidingstaal" style={{ background: t.kleur }} /> {t.naam}:{" "}
                  {[t.lengte > 0 ? metertekst(t.lengte) : null, t.oppervlakte > 0 ? `${t.oppervlakte.toFixed(1).replace(".", ",")} m²` : null]
                    .filter(Boolean)
                    .join(" · ") || `${t.aantal}×`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Leidingformulier({
  leiding,
  andere,
  bezig,
  opBewaren,
  opVerwijderen,
  opSluiten,
}: {
  leiding: Leiding;
  andere: { id: number; naam: string }[];
  bezig: boolean;
  opBewaren: (wijziging: Partial<Nieuweleiding>) => Promise<boolean>;
  opVerwijderen: () => void;
  opSluiten: () => void;
}) {
  const [soort, setSoort] = useState(leiding.soort);
  const [ligging, setLigging] = useState<Ligging>(leiding.ligging);
  const [hoogte, setHoogte] = useState(String(leiding.hoogte ?? MUURHOOGTE).replace(".", ","));
  const [diameter, setDiameter] = useState(String(leiding.diameter));
  const [tot, setTot] = useState<number | null>(leiding.totVerdiepingId);
  const [label, setLabel] = useState(leiding.label ?? "");
  const gekend = leidingsoort(soort);
  // Een lijn blijft een lijn, een zone een zone, en een stijgleiding een punt.
  const liggingen: readonly Ligging[] =
    leiding.ligging === "stijg" ? ["stijg"] : leiding.ligging === "zone" ? ["zone"] : ["vloer", "muur", "plafond", "grond"];
  const maat = leiding.ligging === "zone" ? `${oppervlakteVan(leiding).toFixed(1).replace(".", ",")} m²` : leiding.ligging === "stijg" ? null : metertekst(lengteVan(leiding));

  return (
    <section className="kaart">
      <h3>
        <span className="leidingstaal" style={{ background: gekend?.kleur ?? "#6b7280" }} /> {gekend?.naam ?? leiding.soort}
        {maat ? <span className="hulp"> · {maat}</span> : null}
      </h3>
      <div className="veldenrij">
        <div>
          <label htmlFor="leiding-soort">Soort</label>
          <select id="leiding-soort" value={soort} onChange={(g) => setSoort(g.currentTarget.value)}>
            {LEIDINGSOORTEN.map((s) => (
              <option key={s.soort} value={s.soort}>
                {s.naam}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="leiding-ligt">Ligt</label>
          <select id="leiding-ligt" value={ligging} onChange={(g) => setLigging(g.currentTarget.value as Ligging)} disabled={liggingen.length === 1}>
            {liggingen.map((l) => (
              <option key={l} value={l}>
                {LIGGINGNAMEN[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="veldenrij">
        {ligging === "muur" ? (
          <div>
            <label htmlFor="leiding-hoogte-wijzig">Hoogte (m)</label>
            <input id="leiding-hoogte-wijzig" inputMode="decimal" value={hoogte} onChange={(g) => setHoogte(g.currentTarget.value)} />
          </div>
        ) : null}
        <div>
          <label htmlFor="leiding-diameter">Doorsnede (mm)</label>
          <input id="leiding-diameter" inputMode="numeric" value={diameter} onChange={(g) => setDiameter(g.currentTarget.value)} />
        </div>
        {ligging === "stijg" ? (
          <div>
            <label htmlFor="leiding-tot-wijzig">Tot</label>
            <select id="leiding-tot-wijzig" value={tot ?? ""} onChange={(g) => setTot(Number(g.currentTarget.value) || null)}>
              {tot === null ? <option value="">Kies een verdieping</option> : null}
              {andere.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.naam}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <label htmlFor="leiding-label">Label</label>
      <input id="leiding-label" value={label} maxLength={80} placeholder="bv. naar de keuken" onChange={(g) => setLabel(g.currentTarget.value)} />
      <div className="knoppenrij">
        <button
          type="button"
          disabled={bezig}
          onClick={() =>
            void opBewaren({
              soort,
              ligging,
              hoogte: ligging === "muur" ? Number(hoogte.replace(",", ".")) : null,
              diameter: Number(diameter),
              totVerdiepingId: ligging === "stijg" ? tot : null,
              label: label.trim() || null,
            })
          }
        >
          Bewaren
        </button>
        <button type="button" className="gevaar" onClick={opVerwijderen} disabled={bezig}>
          Verwijderen
        </button>
        <button type="button" className="stil" onClick={opSluiten}>
          Sluiten
        </button>
      </div>
    </section>
  );
}
