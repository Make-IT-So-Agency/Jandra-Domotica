"use client";

import { useEffect, useRef, useState } from "react";

import { PERSONEN, PERSOONSNAMEN, ander, bovenschrift, type Persoon, type Ronde } from "@/lib/huishouden/balans";
import { BUDGET, STAP, begrens, verdeeld, type Stap3Gegevens } from "@/lib/huishouden/bieden";
import { halfJes, urenTekst } from "@/lib/huishouden/voorstel";

import { bodActie, klaarMetBiedenActie, naarVoorstelActie } from "./acties";
import type { Voer } from "./balans";

/** Zo lang na de laatste beweging van een schuifbalk wordt het bod bewaard. */
const BEWAAR_NA_MS = 500;

/**
 * Stap 3: als jullie allebei "Wil ik" zeggen op dezelfde kaart, verdeelt elk
 * 100 punten naar hoe graag. Je ziet enkel je eigen biedingen; die van de
 * ander verschijnen pas in het voorstel, als reden bij de kaart.
 */
export function StapBieden({
  ik,
  ronde,
  gegevens,
  voer,
}: {
  ik: Persoon;
  ronde: Ronde;
  gegevens: Stap3Gegevens;
  voer: Voer;
}) {
  const ids = new Set(gegevens.kaarten.map(({ kaart }) => kaart.id));
  const [lokaal, setLokaal] = useState<Record<number, number>>(gegevens.mijn);
  const klokken = useRef<Record<number, number>>({});
  const teBewaren = useRef<Record<number, number>>({});

  // Wat de server bevestigt, neemt het over, behalve voor een balk die je nog aan het verschuiven bent.
  useEffect(() => {
    setLokaal((vorig) => {
      const nieuw = { ...vorig };
      for (const [id, punten] of Object.entries(gegevens.mijn)) {
        if (!klokken.current[Number(id)]) nieuw[Number(id)] = punten;
      }
      return nieuw;
    });
  }, [gegevens.mijn]);

  useEffect(() => () => Object.values(klokken.current).forEach((klok) => window.clearTimeout(klok)), []);

  const open = ronde.fase === "bieden";
  const ikKlaar = gegevens.klaar[ik];
  const vergrendeld = !open || ikKlaar;
  const mijnBiedingen = new Map(Object.entries(lokaal).map(([id, punten]) => [Number(id), punten]));
  const totaal = verdeeld(mijnBiedingen, ids);
  const deAnder = ander(ik);
  const allebeiKlaar = gegevens.klaar.jan && gegevens.klaar.sandra;

  function schuif(kaartId: number, gevraagd: number) {
    const bod = begrens(gevraagd, verdeeld(mijnBiedingen, ids, kaartId));
    setLokaal((vorig) => ({ ...vorig, [kaartId]: bod }));
    teBewaren.current[kaartId] = bod;
    window.clearTimeout(klokken.current[kaartId]);
    klokken.current[kaartId] = window.setTimeout(() => void bewaar(kaartId), BEWAAR_NA_MS);
  }

  async function bewaar(kaartId: number) {
    window.clearTimeout(klokken.current[kaartId]);
    delete klokken.current[kaartId];
    const bod = teBewaren.current[kaartId];
    delete teBewaren.current[kaartId];
    if (bod !== undefined) await voer(() => bodActie(kaartId, bod));
  }

  /** Eerst wat nog openstaat bewaren: daarna zijn je biedingen vergrendeld. */
  async function klaar() {
    for (const id of Object.keys(teBewaren.current)) await bewaar(Number(id));
    await voer(() => klaarMetBiedenActie(true));
  }

  if (gegevens.kaarten.length === 0) {
    return (
      <>
        <div className="balans-intro">
          <h2 id="stap-3">Stap 3 · Wat jullie allebei graag doen</h2>
          <p>Bieden is alleen nodig voor kaarten die jullie allebei willen.</p>
        </div>
        <p className="melding goed cheer">Geen enkele botsing: elke kaart die iemand graag doet, heeft al een thuis.</p>
        {open ? (
          <div className="knoppenrij">
            <button type="button" onClick={() => voer(naarVoorstelActie)}>
              Naar het voorstel
            </button>
          </div>
        ) : null}
      </>
    );
  }

  const aantal = gegevens.kaarten.length;
  return (
    <>
      <div className="balans-intro">
        <h2 id="stap-3">Stap 3 · Wat jullie allebei graag doen</h2>
        <p>
          Jullie willen {aantal === 1 ? "deze kaart" : `deze ${aantal} kaarten`} allebei graag, dat is goed nieuws. Verdeel
          je 100 punten naar hoe graag je elke kaart wilt; wie het liefst wil, krijgt de kaart. Nipte verschillen kunnen
          jullie in het voorstel nog samen bijsturen.
        </p>
      </div>

      {!open ? <p className="melding info">De biedingen liggen vast. Ze tellen mee in het voorstel.</p> : null}

      <div className="budgetvak">
        <div className="budget-getallen">
          <span>Nog {BUDGET - totaal} punten</span>
          <span>{totaal} van 100 verdeeld</span>
        </div>
        <div className="meter" aria-hidden="true">
          <i className="accent" style={{ width: `${Math.min(100, totaal)}%` }} />
        </div>
        {aantal === 1 ? (
          <p className="hint">Met één kaart geven jullie allicht allebei alles; dan beslist de weegschaal.</p>
        ) : null}
      </div>

      <div className="kaartenraster invullen">
        {gegevens.kaarten.map(({ kaart, uren, mentaal }) => {
          const waarde = lokaal[kaart.id] ?? 0;
          const veld = `bod-${kaart.id}`;
          return (
            <article key={kaart.id} className="werkkaart">
              <div className="werkkaart-bovenschrift">{bovenschrift(kaart)}</div>
              <h3 className="werkkaart-titel">{kaart.titel}</h3>
              <div className="mini-cijfers">
                <span className="label-vlag">{urenTekst(uren)}</span>
                <span className="label-vlag">Mentaal {halfJes(mentaal)}</span>
              </div>
              <div className="vraag">
                <label className="vraag-kop" htmlFor={veld}>
                  Hoe graag wil je deze?
                </label>
                <div className="bod">
                  <input
                    id={veld}
                    type="range"
                    min={0}
                    max={BUDGET}
                    step={STAP}
                    value={waarde}
                    disabled={vergrendeld}
                    onChange={(gebeurtenis) => schuif(kaart.id, Number(gebeurtenis.target.value))}
                  />
                  <output htmlFor={veld}>{waarde}</output>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="balans-onder">
        <div className="labelrij">
          {PERSONEN.map((persoon) => (
            <span key={persoon} className={`label-vlag ${gegevens.klaar[persoon] ? persoon : ""}`}>
              {PERSOONSNAMEN[persoon]} {gegevens.klaar[persoon] ? "klaar" : "bezig"}
            </span>
          ))}
        </div>
        {open ? (
          <div className="knoppenrij">
            {ikKlaar ? (
              <button type="button" className="stil" onClick={() => voer(() => klaarMetBiedenActie(false))}>
                Toch nog aanpassen
              </button>
            ) : (
              <button type="button" onClick={() => void klaar()}>
                Ik ben klaar
              </button>
            )}
            {allebeiKlaar ? (
              <button type="button" onClick={() => voer(naarVoorstelActie)}>
                Naar het voorstel
              </button>
            ) : null}
          </div>
        ) : null}
        {open && ikKlaar && !allebeiKlaar ? <p className="melding goed">Even wachten op {PERSOONSNAMEN[deAnder]}.</p> : null}
      </div>
    </>
  );
}
