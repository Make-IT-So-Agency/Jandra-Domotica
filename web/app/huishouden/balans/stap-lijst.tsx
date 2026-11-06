"use client";

import { useState } from "react";

import {
  PERSONEN,
  PERSOONSNAMEN,
  actieveKaarten,
  bovenschrift,
  lijstOpen,
  verdelingslabel,
  type Kaart,
  type Kaartinvoer,
  type Persoon,
  type Ronde,
} from "@/lib/huishouden/balans";

import {
  aanDeSlagActie,
  lijstakkoordActie,
  schrapKaartActie,
  verwijderKaartActie,
  voegKaartToeActie,
  wijzigKaartActie,
} from "./acties";
import type { Voer } from "./balans";
import { Dobbelsteen, Doorhaling, Potlood, Terugdraaien, Vuilbak } from "./iconen";
import { Kaartdialoog } from "./kaartdialoog";

type Dialoog = { kaart: Kaart | null } | null;

/** Stap 1: samen de lijst opstellen, tot jullie allebei akkoord zijn. */
export function StapLijst({
  ik,
  ronde,
  kaarten,
  akkoord,
  domeinen,
  voer,
}: {
  ik: Persoon;
  ronde: Ronde;
  kaarten: Kaart[];
  akkoord: Record<Persoon, boolean>;
  domeinen: string[];
  voer: Voer;
}) {
  const [dialoog, setDialoog] = useState<Dialoog>(null);
  const [teBevestigen, setTeBevestigen] = useState<number | null>(null);

  const open = lijstOpen(ronde);
  const actief = actieveKaarten(kaarten);

  return (
    <>
      <div className="balans-intro">
        <h2 id="stap-1">Stap 1 · Welke stromen horen bij ons huishouden?</h2>
        <p>
          Vul samen de lijst aan tot alles erop staat wat jullie gezin draaiende houdt. Leg per kaart vast wanneer het{" "}
          <strong>goed genoeg</strong> is. Elke wijziging zet het akkoord van jullie allebei terug.
        </p>
      </div>

      {open ? (
        <div className="labelrij">
          {PERSONEN.map((persoon) => (
            <span key={persoon} className={`label-vlag ${akkoord[persoon] ? persoon : ""}`}>
              {PERSOONSNAMEN[persoon]} {akkoord[persoon] ? "akkoord" : "nog niet akkoord"}
            </span>
          ))}
        </div>
      ) : (
        <p className="melding info">
          De lijst ligt vast met {actief.length} kaarten. Wil je ze nog aanpassen, start dan in de laatste stap een
          nieuwe ronde.
        </p>
      )}

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
          {akkoord.jan && akkoord.sandra ? (
            <button type="button" onClick={() => voer(aanDeSlagActie)}>
              Aan de slag
            </button>
          ) : null}
        </div>
      ) : null}

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
    </>
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
