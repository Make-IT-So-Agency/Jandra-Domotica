"use client";

import { useState } from "react";

import {
  OVERSTEKNAMEN,
  PLEKKEN,
  PLEKNAMEN,
  TOESTELLEN,
  TOESTELNAMEN,
  schoneIndeling,
  type Indeling,
  type Overstekkant,
  type Plek,
  type Toestel,
} from "@/lib/bouw/drie/maatwerk";
import { soortStuk, type Stuk } from "@/lib/bouw/inrichting";

/**
 * De indeling van maatwerk bij Inrichten (zie lib/bouw/drie/maatwerk.ts): de
 * fronten, een open vak, een nis en de plint van een kast; de lades, de
 * kookplaat, de spoelbak, de vaatwasser, het werkblad, de spatwand, een
 * overstek en wangen bij de keuken; een oven of de koelkast in een
 * kolomkast. Elke wijziging komt meteen in 3D; bewaren gaat met de rest:
 * Meubels bewaren. Enkel voor de browser.
 */

/** De stukken met een indeling: de kasten (niet de technische), de keuken en de kolomkast. */
const MET_INDELING = new Set(["kast", "kleerkast", "tv_meubel", "nachtkastje", "maatkast", "keuken_onder", "keukeneiland", "keuken_hoog"]);

export const heeftIndeling = (soort: string) => MET_INDELING.has(soort);

/** Een maat in centimeter, bewaard in meter; een leeg of fout veld verandert niets. */
function Cmveld({ id, label, meter, min, max, zet }: { id: string; label: string; meter: number; min: number; max: number; zet: (meter: number) => void }) {
  const [tekst, setTekst] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={tekst ?? String(Math.round(meter * 1000) / 10).replace(".", ",")}
        onChange={(g) => setTekst(g.currentTarget.value)}
        onBlur={(g) => {
          const cm = Number(g.currentTarget.value.replace(",", ".").trim());
          setTekst(null);
          if (g.currentTarget.value.trim() !== "" && Number.isFinite(cm) && cm >= min * 100 && cm <= max * 100) zet(Math.round(cm * 10) / 1000);
        }}
        onKeyDown={(g) => {
          if (g.key === "Enter") g.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** Een aantal, van min tot max. */
function Aantalkeuze({ id, label, waarde, min, max, zet, namen }: { id: string; label: string; waarde: number; min: number; max: number; zet: (n: number) => void; namen?: Record<number, string> }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={waarde} onChange={(g) => zet(Number(g.currentTarget.value))}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <option key={n} value={n}>
            {namen?.[n] ?? n}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Wat een kast zonder indeling heeft: een front per halve meter, zoals de 3D-tekening. */
const frontenVan = (breedte: number, per: number) => Math.max(1, Math.min(20, Math.round(breedte / per) || 1));

export function Stukindeling({ stuk, wijzig }: { stuk: Stuk; wijzig: (indeling: Indeling | null) => void }) {
  const vorm = soortStuk(stuk.soort)?.vorm;
  if (!heeftIndeling(stuk.soort) || !vorm) return null;
  const eiland = stuk.soort === "keukeneiland";
  // Zonder indeling: wat de 3D-tekening dan toont (een kookplaat links bij een keuken van minstens 1,20 m).
  const ind: Indeling = stuk.indeling ?? (vorm === "keuken" && stuk.breedte >= 1.2 ? { kookplaat: "links" } : {});
  const zet = (deel: Partial<Indeling>) => wijzig(schoneIndeling({ ...ind, ...deel }));
  const plek = (id: string, label: string, waarde: Plek | null | undefined, kies: (p: Plek | null) => void) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={waarde ?? ""} onChange={(g) => kies((g.currentTarget.value || null) as Plek | null)}>
        <option value="">Geen</option>
        {PLEKKEN.map((p) => (
          <option key={p} value={p}>
            {PLEKNAMEN[p]}
          </option>
        ))}
      </select>
    </div>
  );

  if (vorm === "kast") {
    const breedteDicht = stuk.breedte - (ind.open?.breedte ?? 0);
    const fronten = ind.fronten ?? frontenVan(breedteDicht, 0.5);
    const nis = ind.nis ?? null;
    return (
      <details className="palet indeling" open>
        <summary className="palet-kop">Indeling</summary>
        <div className="veldenrij">
          <Aantalkeuze id="ind-fronten" label="Fronten" waarde={fronten} min={1} max={20} zet={(n) => zet({ fronten: n })} />
          <div>
            <label htmlFor="ind-open">Open vak</label>
            <select
              id="ind-open"
              value={ind.open?.kant ?? ""}
              onChange={(g) => {
                const kant = g.currentTarget.value;
                zet({ open: kant === "links" || kant === "rechts" ? { kant, breedte: ind.open?.breedte ?? 0.4, planken: ind.open?.planken ?? 4 } : null });
              }}
            >
              <option value="">Geen</option>
              <option value="links">Links</option>
              <option value="rechts">Rechts</option>
            </select>
          </div>
          {ind.open ? (
            <>
              <Cmveld key={`ob${stuk.id}`} id="ind-open-breedte" label="Breedte open vak (cm)" meter={ind.open.breedte} min={0.15} max={2} zet={(breedte) => zet({ open: { ...ind.open!, breedte } })} />
              <Aantalkeuze id="ind-planken" label="Legplanken" waarde={ind.open.planken} min={0} max={12} zet={(planken) => zet({ open: { ...ind.open!, planken } })} />
            </>
          ) : null}
          <Cmveld key={`pl${stuk.id}`} id="ind-plint" label="Plint (cm)" meter={ind.plint ?? 0} min={0} max={0.3} zet={(plint) => zet({ plint })} />
        </div>
        <label className="keuzevak" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={nis !== null}
            onChange={(g) =>
              zet({ nis: g.currentTarget.checked ? { van: 1, tot: Math.min(2, fronten), onder: 0.9, boven: Math.min(1.5, stuk.hoogte - 0.3), legger: true } : null })
            }
          />
          Een nis, zoals een koffiehoek, met licht
        </label>
        {nis ? (
          <div className="veldenrij">
            <Aantalkeuze id="ind-nis-van" label="Van front" waarde={nis.van} min={1} max={fronten} zet={(van) => zet({ nis: { ...nis, van, tot: Math.max(van, nis.tot) } })} />
            <Aantalkeuze id="ind-nis-tot" label="Tot front" waarde={Math.max(nis.van, nis.tot)} min={nis.van} max={fronten} zet={(tot) => zet({ nis: { ...nis, tot } })} />
            <Cmveld key={`no${stuk.id}`} id="ind-nis-onder" label="Onderkant (cm)" meter={nis.onder} min={0} max={3} zet={(onder) => zet({ nis: { ...nis, onder } })} />
            <Cmveld key={`nb${stuk.id}`} id="ind-nis-boven" label="Bovenkant (cm)" meter={nis.boven} min={0} max={3.5} zet={(boven) => zet({ nis: { ...nis, boven } })} />
            <label className="keuzevak">
              <input type="checkbox" checked={nis.legger} onChange={(g) => zet({ nis: { ...nis, legger: g.currentTarget.checked } })} />
              Met een legger
            </label>
          </div>
        ) : null}
        <p className="hulp">De achterkant en de bodem van de nis krijgen het materiaal van het blad, hieronder.</p>
      </details>
    );
  }

  if (vorm === "keuken") {
    return (
      <details className="palet indeling" open>
        <summary className="palet-kop">Indeling</summary>
        <div className="veldenrij">
          <Aantalkeuze id="ind-fronten" label="Fronten" waarde={ind.fronten ?? frontenVan(stuk.breedte, 0.6)} min={1} max={20} zet={(n) => zet({ fronten: n })} />
          <Aantalkeuze id="ind-lades" label="Lades" waarde={Math.max(1, ind.lades ?? 1)} min={1} max={4} namen={{ 1: "Deuren", 2: "2 rijen", 3: "3 rijen", 4: "4 rijen" }} zet={(lades) => zet({ lades })} />
          {plek("ind-kookplaat", "Kookplaat", ind.kookplaat, (kookplaat) => zet({ kookplaat }))}
          {plek("ind-spoelbak", "Spoelbak", ind.spoelbak, (spoelbak) => zet({ spoelbak }))}
          <Cmveld key={`bl${stuk.id}`} id="ind-blad" label="Werkblad (cm)" meter={ind.blad ?? 0.04} min={0.006} max={0.1} zet={(blad) => zet({ blad })} />
          {!eiland ? <Cmveld key={`sp${stuk.id}`} id="ind-spatwand" label="Spatwand (cm)" meter={ind.spatwand ?? 0} min={0} max={1.5} zet={(spatwand) => zet({ spatwand })} /> : null}
        </div>
        <label className="keuzevak" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={ind.vaatwasser === true} onChange={(g) => zet({ vaatwasser: g.currentTarget.checked })} />
          Met een vaatwasser
        </label>
        {eiland ? (
          <>
            <div className="veldenrij" style={{ marginTop: 8 }}>
              <div>
                <label htmlFor="ind-overstek">Overstek</label>
                <select
                  id="ind-overstek"
                  value={ind.overstek?.kant ?? ""}
                  onChange={(g) => {
                    const kant = g.currentTarget.value as Overstekkant | "";
                    zet({ overstek: kant ? { kant, lengte: ind.overstek?.lengte ?? 0.6 } : null });
                  }}
                >
                  <option value="">Geen</option>
                  {(Object.keys(OVERSTEKNAMEN) as Overstekkant[]).map((kant) => (
                    <option key={kant} value={kant}>
                      {OVERSTEKNAMEN[kant]}
                    </option>
                  ))}
                </select>
              </div>
              {ind.overstek ? (
                <Cmveld key={`ov${stuk.id}`} id="ind-overstek-lengte" label="Overstek (cm)" meter={ind.overstek.lengte} min={0.1} max={1.5} zet={(lengte) => zet({ overstek: { ...ind.overstek!, lengte } })} />
              ) : null}
            </div>
            <label className="keuzevak" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={ind.wangen === true} onChange={(g) => zet({ wangen: g.currentTarget.checked })} />
              Het werkblad loopt aan de uiteinden door tot op de vloer
            </label>
          </>
        ) : null}
        <p className="hulp">Onder een overstek komen geen kasten: daar staan de barkrukken. Het werkblad en de spatwand krijgen het materiaal van het blad, hieronder.</p>
      </details>
    );
  }

  if (vorm === "kolom") {
    const toestel = ind.toestel ?? null;
    return (
      <details className="palet indeling" open>
        <summary className="palet-kop">Indeling</summary>
        <div className="veldenrij">
          <div>
            <label htmlFor="ind-toestel">Toestel</label>
            <select id="ind-toestel" value={toestel ?? ""} onChange={(g) => zet({ toestel: (g.currentTarget.value || null) as Toestel | null })}>
              <option value="">Geen: enkel kast</option>
              {TOESTELLEN.map((t) => (
                <option key={t} value={t}>
                  {TOESTELNAMEN[t]}
                </option>
              ))}
            </select>
          </div>
          {toestel && toestel !== "koelkast" ? (
            <Cmveld key={`th${stuk.id}`} id="ind-toestelhoogte" label="Onderkant oven (cm)" meter={ind.toestelhoogte ?? 0.9} min={0} max={2.2} zet={(toestelhoogte) => zet({ toestelhoogte })} />
          ) : null}
        </div>
        <p className="hulp">Een oven, een kookplaat, de koelkast en de vaatwasser krijgen bij Technieken een eigen kring.</p>
      </details>
    );
  }
  return null;
}
