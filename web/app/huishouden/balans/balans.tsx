"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  GEBOUWDE_STAPPEN,
  PERSONEN,
  PERSOONSNAMEN,
  STAPPEN,
  actieveKaarten,
  bovenschrift,
  lijstOpen,
  stapVan,
  verdelingslabel,
  type Kaart,
  type Kaartinvoer,
  type Persoon,
  type Ronde,
} from "@/lib/huishouden/balans";

import {
  lijstakkoordActie,
  schrapKaartActie,
  verwijderKaartActie,
  voegKaartToeActie,
  wijzigKaartActie,
  type Resultaat,
} from "./acties";
import { Dobbelsteen, Doorhaling, Potlood, Terugdraaien, Vuilbak } from "./iconen";
import { Kaartdialoog } from "./kaartdialoog";

/** Zo vaak kijkt de pagina of de ander iets wijzigde, zolang ze in beeld is. */
const VERVERS_MS = 5000;

/**
 * Jan en Sandra werken elk op een eigen toestel, tegelijk. De pagina haalt
 * daarom om de paar seconden op wat er nieuw is, en meteen als je ernaar
 * terugkeert. Wat je zelf aan het typen bent, blijft staan.
 */
function useLiveVerversen() {
  const router = useRouter();
  useEffect(() => {
    const ververs = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const klok = window.setInterval(ververs, VERVERS_MS);
    document.addEventListener("visibilitychange", ververs);
    return () => {
      window.clearInterval(klok);
      document.removeEventListener("visibilitychange", ververs);
    };
  }, [router]);
}

type Dialoog = { kaart: Kaart | null } | null;

export function Balans({
  ik,
  ronde,
  kaarten,
  akkoord,
  domeinen,
}: {
  ik: Persoon;
  ronde: Ronde;
  kaarten: Kaart[];
  akkoord: Record<Persoon, boolean>;
  domeinen: string[];
}) {
  useLiveVerversen();
  const router = useRouter();
  const [dialoog, setDialoog] = useState<Dialoog>(null);
  const [teBevestigen, setTeBevestigen] = useState<number | null>(null);
  const [melding, setMelding] = useState("");

  // De bewaarmelding verdwijnt vanzelf, behalve zolang er iets bewaard wordt.
  useEffect(() => {
    if (!melding || melding === "Bewaren…") return;
    const klok = window.setTimeout(() => setMelding(""), 3000);
    return () => window.clearTimeout(klok);
  }, [melding]);

  async function voer(actie: () => Promise<Resultaat>): Promise<Resultaat> {
    setMelding("Bewaren…");
    let resultaat: Resultaat;
    try {
      resultaat = await actie();
    } catch {
      resultaat = { ok: false, melding: "Bewaren lukte niet. Probeer het opnieuw." };
    }
    setMelding(resultaat.melding);
    router.refresh();
    return resultaat;
  }

  const open = lijstOpen(ronde);
  const actief = actieveKaarten(kaarten);
  const huidigeStap = stapVan(ronde.fase);

  return (
    <div className="balans">
      <header className="balans-kop">
        <div>
          <div className="bovenschrift">Jandra · Huishouden</div>
          <h1>De balans</h1>
        </div>
      </header>

      <Stappenbalk huidig={huidigeStap} bekeken={1} />

      <section className="balans-stap" aria-labelledby="stap-1">
        <div className="balans-intro">
          <h2 id="stap-1">Stap 1 · Welke stromen horen bij ons huishouden?</h2>
          <p>
            Vul samen de lijst aan tot alles erop staat wat jullie gezin draaiende houdt. Leg per kaart vast wanneer
            het <strong>goed genoeg</strong> is. Elke wijziging zet het akkoord van jullie allebei terug.
          </p>
        </div>

        <div className="labelrij">
          {PERSONEN.map((persoon) => (
            <span key={persoon} className={`label-vlag ${akkoord[persoon] ? persoon : ""}`}>
              {PERSOONSNAMEN[persoon]} {akkoord[persoon] ? "akkoord" : "nog niet akkoord"}
            </span>
          ))}
        </div>

        {!open ? (
          <p className="melding info">
            De lijst ligt vast met {actief.length} kaarten. Wil je ze nog aanpassen, start dan in de laatste stap een
            nieuwe ronde.
          </p>
        ) : null}

        {kaarten.length === 0 ? <p className="leeg">Nog geen kaarten. Voeg de eerste stroom toe.</p> : null}

        <div className="kaartenraster">
          {kaarten.map((kaart) => (
            <Werkkaart
              key={kaart.id}
              kaart={kaart}
              bewerkbaar={open}
              bevestigen={teBevestigen === kaart.id}
              pasAan={() => setDialoog({ kaart })}
              schrap={() => voer(() => schrapKaartActie(kaart.id, !kaart.geschrapt))}
              vraagVerwijderen={() => setTeBevestigen(kaart.id)}
              annuleer={() => setTeBevestigen(null)}
              verwijder={async () => {
                setTeBevestigen(null);
                await voer(() => verwijderKaartActie(kaart.id));
              }}
            />
          ))}
          {open ? (
            <button type="button" className="werkkaart toevoegen" onClick={() => setDialoog({ kaart: null })}>
              + Kaart toevoegen
            </button>
          ) : null}
        </div>

        {open ? (
          <div className="balans-onder">
            {akkoord.jan && akkoord.sandra ? (
              GEBOUWDE_STAPPEN >= 2 ? null : (
                <p className="melding goed">
                  Jullie zijn het allebei eens over de lijst. Stap 2, inschatten en claimen, komt er binnenkort bij.
                </p>
              )
            ) : null}
            <div className="knoppenrij">
              {akkoord[ik] ? (
                <button type="button" className="stil" onClick={() => voer(() => lijstakkoordActie(false, ronde.lijstVersie))}>
                  Akkoord intrekken
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actief.length === 0}
                  title={actief.length === 0 ? "Voeg eerst een kaart toe." : undefined}
                  onClick={() => voer(() => lijstakkoordActie(true, ronde.lijstVersie))}
                >
                  Ik ga akkoord met deze lijst
                </button>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {dialoog ? (
        <Kaartdialoog
          key={dialoog.kaart?.id ?? "nieuw"}
          kaart={dialoog.kaart}
          open
          domeinen={domeinen}
          sluit={() => setDialoog(null)}
          bewaar={(invoer: Record<keyof Kaartinvoer, string>) =>
            voer(() => (dialoog.kaart ? wijzigKaartActie(dialoog.kaart.id, invoer) : voegKaartToeActie(invoer)))
          }
        />
      ) : null}

      <p className="bewaarmelding" role="status" aria-live="polite">
        {melding}
      </p>
    </div>
  );
}

/**
 * De vijf stappen. Je kan terug naar een stap die al bereikt is; vooruit gaat
 * enkel met de knop onderaan een stap. Een stap die nog niet gebouwd is, staat
 * uit.
 */
function Stappenbalk({ huidig, bekeken }: { huidig: number; bekeken: number }) {
  return (
    <nav className="stappenbalk" aria-label="Stappen">
      <ol>
        {STAPPEN.map((stap, index) => {
          const nummer = index + 1;
          const bereikbaar = nummer <= huidig && nummer <= GEBOUWDE_STAPPEN;
          const klasse = nummer === bekeken ? "huidig" : nummer < huidig ? "af" : "later";
          return (
            <li key={stap.fase}>
              <button
                type="button"
                className={klasse}
                disabled={!bereikbaar}
                aria-current={nummer === bekeken ? "step" : undefined}
              >
                <span>Stap {nummer}</span>
                <b>{stap.naam}</b>
                <span>{stap.ondertitel}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Het ronde icoon naast de titel: een dobbelsteen voor het spel, of de initiaal van wie de kaart vast heeft. */
function Verdelingsbadge({ kaart }: { kaart: Kaart }) {
  if (kaart.verdeling === "spel") {
    return (
      <span className="ronde-badge spel" role="img" aria-label="Via het spel" title="Via het spel">
        <Dobbelsteen />
      </span>
    );
  }
  if (kaart.verdeling === "jan" || kaart.verdeling === "sandra") {
    const naam = PERSOONSNAMEN[kaart.verdeling];
    return (
      <span
        className={`ronde-badge ${kaart.verdeling}`}
        role="img"
        aria-label={`Vast bij ${naam}`}
        title={`Vast bij ${naam}`}
      >
        {naam[0]}
      </span>
    );
  }
  return null;
}

function Werkkaart({
  kaart,
  bewerkbaar,
  bevestigen,
  pasAan,
  schrap,
  vraagVerwijderen,
  annuleer,
  verwijder,
}: {
  kaart: Kaart;
  bewerkbaar: boolean;
  bevestigen: boolean;
  pasAan: () => void;
  schrap: () => void;
  vraagVerwijderen: () => void;
  annuleer: () => void;
  verwijder: () => void;
}) {
  const label = verdelingslabel(kaart);
  return (
    <article className={`werkkaart${kaart.geschrapt ? " geschrapt" : ""}`}>
      <div className="werkkaart-bovenschrift">{bovenschrift(kaart)}</div>
      <div className="titelrij">
        <h3 className="werkkaart-titel">{kaart.titel}</h3>
        <Verdelingsbadge kaart={kaart} />
      </div>
      {kaart.omschrijving ? <p className="werkkaart-omschrijving">{kaart.omschrijving}</p> : null}
      {kaart.goedGenoeg ? (
        <p className="werkkaart-goed">
          <strong>Goed genoeg:</strong> {kaart.goedGenoeg}
        </p>
      ) : null}
      {label ? (
        <div>
          <span className="label-vlag">{label}</span>
        </div>
      ) : null}

      {bewerkbaar ? (
        bevestigen ? (
          <div className="werkkaart-voet bevestig">
            <strong>Zeker?</strong>
            <button type="button" className="gevaar klein" onClick={verwijder}>
              Ja
            </button>
            <button type="button" className="stil klein" onClick={annuleer}>
              Nee
            </button>
          </div>
        ) : (
          <div className="werkkaart-voet">
            <button type="button" className="stil klein icoonknop" aria-label="Aanpassen" title="Aanpassen" onClick={pasAan}>
              <Potlood />
            </button>
            <button
              type="button"
              className="stil klein icoonknop"
              aria-label={kaart.geschrapt ? "Terugzetten" : "Schrappen"}
              title={kaart.geschrapt ? "Terugzetten" : "Schrappen"}
              onClick={schrap}
            >
              {kaart.geschrapt ? <Terugdraaien /> : <Doorhaling />}
            </button>
            <button
              type="button"
              className="gevaar klein icoonknop rechts"
              aria-label="Verwijderen"
              title="Verwijderen"
              onClick={vraagVerwijderen}
            >
              <Vuilbak />
            </button>
          </div>
        )
      ) : null}
    </article>
  );
}
