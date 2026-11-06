"use client";

import { useEffect, useRef, useState } from "react";

import {
  CLAIMNAMEN,
  CLAIMS,
  LEGE_INVOER,
  PERSONEN,
  PERSOONSNAMEN,
  SCORES,
  TIJDSCORES,
  ander,
  bovenschrift,
  kaartenOmInTeVullen,
  stapVan,
  volgendeFase,
  voortgangstekst,
  vragenVoor,
  type Claim,
  type Invoer,
  type Kaart,
  type Persoon,
  type Ronde,
  type Score,
  type Stap2Gegevens,
} from "@/lib/huishouden/balans";

import { beschikbareTijdActie, claimActie, scoreActie, verderNaInschattenActie, type Resultaat } from "./acties";
import type { Voer } from "./balans";

/** Wat je net tikte en nog niet terug van de server kwam, per "kaart:veld". */
type Lokaal = Record<string, Claim | Score>;

const LASTSCORES: Partial<Record<Score, string>> = { 1: "Nauwelijks", 5: "Zit er constant" };

/**
 * Stap 2: elk apart, en zonder te zien wat de ander koos, hoe graag je een
 * kaart doet en hoe zwaar ze is.
 *
 * Elke tik wordt meteen bewaard, in de volgorde waarin je tikte. Tot de
 * server ze bevestigt, toont de kaart je laatste tik, zodat snel na elkaar
 * tikken nooit een keuze laat terugspringen.
 */
export function StapInschatten({
  ik,
  ronde,
  kaarten,
  gegevens,
  voer,
}: {
  ik: Persoon;
  ronde: Ronde;
  kaarten: Kaart[];
  gegevens: Stap2Gegevens;
  voer: Voer;
}) {
  const [lokaal, setLokaal] = useState<Lokaal>({});
  const wachtrij = useRef<Promise<unknown>>(Promise.resolve());

  // Wat de server intussen bevestigt, hoeft niet meer lokaal te staan.
  useEffect(() => {
    setLokaal((vorig) => {
      const over: Lokaal = {};
      for (const [sleutel, waarde] of Object.entries(vorig)) {
        const [id, veld] = sleutel.split(":") as [string, keyof Invoer];
        if (gegevens.mijn[Number(id)]?.[veld] !== waarde) over[sleutel] = waarde;
      }
      return Object.keys(over).length === Object.keys(vorig).length ? vorig : over;
    });
  }, [gegevens.mijn]);

  function tik(kaartId: number, veld: keyof Invoer, waarde: Claim | Score, actie: () => Promise<Resultaat>) {
    const sleutel = `${kaartId}:${veld}`;
    setLokaal((vorig) => ({ ...vorig, [sleutel]: waarde }));
    wachtrij.current = wachtrij.current.then(async () => {
      const resultaat = await voer(actie);
      // Lukte het niet, dan toont de kaart weer wat er echt bewaard is.
      if (!resultaat.ok) {
        setLokaal((vorig) => {
          if (vorig[sleutel] !== waarde) return vorig;
          const { [sleutel]: _weg, ...rest } = vorig;
          return rest;
        });
      }
    });
  }

  const invoerVan = (kaartId: number): Invoer => {
    const bewaard = gegevens.mijn[kaartId] ?? LEGE_INVOER;
    return {
      claim: (lokaal[`${kaartId}:claim`] as Claim | undefined) ?? bewaard.claim,
      tijd: (lokaal[`${kaartId}:tijd`] as Score | undefined) ?? bewaard.tijd,
      last: (lokaal[`${kaartId}:last`] as Score | undefined) ?? bewaard.last,
    };
  };

  const deAnder = ander(ik);
  const inTeVullen = kaartenOmInTeVullen(kaarten);
  const verder = stapVan(ronde.fase) > 2;
  const allebeiAf = gegevens.stand.jan.af && gegevens.stand.sandra.af;
  const volgende = volgendeFase("inschatten");

  return (
    <>
      <div className="balans-intro">
        <h2 id="stap-2">Stap 2 · Inschatten en claimen</h2>
        <p>
          Per kaart: <strong>hoe graag doe je het</strong>, hoeveel <strong>fysieke tijd</strong> vraagt het (1 = ½ u · 2 =
          1 u · 3 = 2 à 3 u · 4 = halve dag · 5 = 7 u of meer per week) en hoeveel <strong>mentale last</strong> geeft het
          (1 = nauwelijks, 5 = zit er constant). Er zijn geen foute antwoorden: hoe eerlijker, hoe beter het voorstel. Je
          ziet de keuzes van de ander pas in het voorstel.
        </p>
      </div>

      {verder ? (
        <p className="melding info">Jullie zijn al verder. Pas je hier iets aan, dan past het voorstel zich meteen aan.</p>
      ) : null}

      <Beschikbaretijd bewaard={gegevens.mijnTijd} voer={voer} />

      <div className="labelrij">
        {PERSONEN.map((persoon) => (
          <span key={persoon} className={`label-vlag ${persoon}`}>
            {voortgangstekst(persoon, gegevens.stand[persoon])}
          </span>
        ))}
      </div>

      {inTeVullen.length === 0 ? (
        <p className="leeg">Er is geen enkele kaart om in te vullen. Enkel je beschikbare tijd telt.</p>
      ) : null}

      <div className="kaartenraster invullen">
        {inTeVullen.map((kaart) => {
          const vragen = vragenVoor(kaart);
          const invoer = invoerVan(kaart.id);
          const vanAnder = gegevens.ander?.[kaart.id] ?? null;
          return (
            <article key={kaart.id} className="werkkaart">
              <div className="werkkaart-bovenschrift">{bovenschrift(kaart)}</div>
              <h3 className="werkkaart-titel">{kaart.titel}</h3>
              {kaart.omschrijving ? <p className="werkkaart-omschrijving">{kaart.omschrijving}</p> : null}

              {vragen.claim ? (
                <div className="vraag">
                  <div className="vraag-kop" id={`claim-${kaart.id}`}>
                    Hoe graag doe je dit?
                  </div>
                  <div className="claimraster" role="group" aria-labelledby={`claim-${kaart.id}`}>
                    {CLAIMS.map((claim) => (
                      <button
                        key={claim}
                        type="button"
                        data-v={claim}
                        aria-pressed={invoer.claim === claim}
                        onClick={() => tik(kaart.id, "claim", claim, () => claimActie(kaart.id, claim))}
                      >
                        {CLAIMNAMEN[claim]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {vragen.tijd ? (
                <Schaal
                  id={`tijd-${kaart.id}`}
                  naam="Fysieke tijd"
                  waarde={invoer.tijd}
                  uitleg={TIJDSCORES}
                  vanAnder={verder && vanAnder?.tijd ? `${PERSOONSNAMEN[deAnder]}: ${vanAnder.tijd}` : null}
                  kies={(score) => tik(kaart.id, "tijd", score, () => scoreActie(kaart.id, "tijd", score))}
                />
              ) : null}

              {vragen.last ? (
                <Schaal
                  id={`last-${kaart.id}`}
                  naam="Mentale last"
                  waarde={invoer.last}
                  uitleg={LASTSCORES}
                  vanAnder={verder && vanAnder?.last ? `${PERSOONSNAMEN[deAnder]}: ${vanAnder.last}` : null}
                  kies={(score) => tik(kaart.id, "last", score, () => scoreActie(kaart.id, "last", score))}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      {ronde.fase === "inschatten" ? (
        allebeiAf ? (
          volgende ? (
            <div className="knoppenrij">
              <button type="button" onClick={() => voer(verderNaInschattenActie)}>
                {volgende === "bieden" ? "Verder naar bieden" : "Naar het voorstel"}
              </button>
            </div>
          ) : (
            <p className="melding goed cheer">Jullie zijn allebei klaar. Het voorstel komt er binnenkort bij.</p>
          )
        ) : gegevens.stand[ik].af ? (
          <p className="melding goed">Klaar! Even wachten op {PERSOONSNAMEN[deAnder]}.</p>
        ) : null
      ) : null}
    </>
  );
}

/** Een schaal van 1 tot 5 met bolletjes. Eén tik kiest, een andere tik wijzigt. */
function Schaal({
  id,
  naam,
  waarde,
  uitleg,
  vanAnder,
  kies,
}: {
  id: string;
  naam: string;
  waarde: Score | null;
  uitleg: Partial<Record<Score, string>>;
  vanAnder: string | null;
  kies: (score: Score) => void;
}) {
  return (
    <div className="vraag">
      <div className="vraag-kop" id={id}>
        {naam}
        {vanAnder ? <span className="hint"> · {vanAnder}</span> : null}
      </div>
      <div className="bolletjes" role="group" aria-labelledby={id}>
        {SCORES.map((score) => (
          <button
            key={score}
            type="button"
            aria-pressed={waarde === score}
            aria-label={`${naam} ${score}${uitleg[score] ? `: ${uitleg[score]}` : ""}`}
            title={uitleg[score]}
            onClick={() => kies(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Mijn beschikbare tijd voor gezin en hobby [__] u per week". Bewaart als je
 * het veld verlaat, op Enter, of even nadat je stopte met typen.
 */
function Beschikbaretijd({ bewaard, voer }: { bewaard: number | null; voer: Voer }) {
  const [tekst, setTekst] = useState(bewaard === null ? "" : String(bewaard));
  const [bezig, setBezig] = useState(false);
  const veld = useRef<HTMLInputElement>(null);
  const laatste = useRef(bewaard === null ? "" : String(bewaard));

  // Komt er van de server een andere waarde (bv. na resetten), en ben je niet
  // aan het typen, dan neemt het veld die over.
  useEffect(() => {
    const nieuw = bewaard === null ? "" : String(bewaard);
    if (document.activeElement !== veld.current && !bezig) {
      setTekst(nieuw);
      laatste.current = nieuw;
    }
  }, [bewaard, bezig]);

  async function bewaar(waarde: string) {
    const schoon = waarde.trim();
    if (schoon === laatste.current) return;
    laatste.current = schoon;
    setBezig(true);
    await voer(() => beschikbareTijdActie(schoon));
    setBezig(false);
  }

  useEffect(() => {
    const klok = window.setTimeout(() => void bewaar(tekst), 900);
    return () => window.clearTimeout(klok);
    // bewaar verandert bij elke weergave; enkel de tekst telt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tekst]);

  return (
    <div className="tijdvak">
      <label htmlFor="beschikbare-tijd" className="tijdvak-zin">
        <span>
          <strong>Mijn beschikbare tijd</strong> voor gezin en hobby
        </span>
        <span className="tijdvak-veld">
          <input
            ref={veld}
            id="beschikbare-tijd"
            inputMode="numeric"
            className="kort-getal"
            value={tekst}
            onChange={(gebeurtenis) => setTekst(gebeurtenis.target.value)}
            onBlur={() => void bewaar(tekst)}
            onKeyDown={(gebeurtenis) => {
              if (gebeurtenis.key === "Enter") void bewaar(tekst);
            }}
          />
          <span>u per week</span>
        </span>
      </label>
      <p className="hint">Een ruwe schatting volstaat. Je past het aan als het leven verandert.</p>
    </div>
  );
}
