"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  FREQUENTIES,
  FREQUENTIENAMEN,
  GRENZEN,
  VERDELINGEN,
  VERDELINGSKEUZES,
  type Kaart,
  type Kaartinvoer,
  type Verdeling,
} from "@/lib/huishouden/balans";

import type { Resultaat } from "./acties";

/**
 * De dialoog om een kaart toe te voegen of aan te passen. Op de gsm schuift
 * ze van onderen op, vanaf 620 px staat ze in het midden. Escape of een tik
 * naast de dialoog sluit ze; er is geen kruisje.
 */
export function Kaartdialoog({
  kaart,
  open,
  domeinen,
  sluit,
  bewaar,
}: {
  /** De kaart die je aanpast, of null voor een nieuwe kaart. */
  kaart: Kaart | null;
  open: boolean;
  domeinen: string[];
  sluit: () => void;
  bewaar: (invoer: Record<keyof Kaartinvoer, string>) => Promise<Resultaat>;
}) {
  const dialoog = useRef<HTMLDialogElement>(null);
  const [verdeling, setVerdeling] = useState<Verdeling>(kaart?.verdeling ?? "spel");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    const element = dialoog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  async function verstuur(gebeurtenis: FormEvent<HTMLFormElement>) {
    gebeurtenis.preventDefault();
    const formulier = new FormData(gebeurtenis.currentTarget);
    const veld = (naam: string) => String(formulier.get(naam) ?? "");
    setBezig(true);
    setFout(null);
    const resultaat = await bewaar({
      titel: veld("titel"),
      domein: veld("domein"),
      omschrijving: veld("omschrijving"),
      goedGenoeg: veld("goedGenoeg"),
      frequentie: veld("frequentie"),
      verdeling: veld("verdeling"),
      vasteUren: veld("vasteUren"),
    });
    setBezig(false);
    if (resultaat.ok) sluit();
    else setFout(resultaat.melding);
  }

  const id = (naam: string) => `kaart-${kaart?.id ?? "nieuw"}-${naam}`;

  return (
    <dialog
      ref={dialoog}
      className="dialoogvak"
      aria-labelledby={id("titelkop")}
      onClose={sluit}
      // Een tik naast het formulier valt op de dialoog zelf: dat is de achtergrond.
      onClick={(gebeurtenis) => {
        if (gebeurtenis.target === dialoog.current) sluit();
      }}
    >
      <form onSubmit={verstuur}>
        <h2 id={id("titelkop")}>{kaart ? "Kaart aanpassen" : "Nieuwe kaart"}</h2>

        <div className="veld">
          <label htmlFor={id("titel")}>Titel</label>
          <input id={id("titel")} name="titel" required maxLength={GRENZEN.titel} defaultValue={kaart?.titel ?? ""} />
        </div>

        <div className="veld">
          <label htmlFor={id("domein")}>Domein</label>
          <input
            id={id("domein")}
            name="domein"
            required
            maxLength={GRENZEN.domein}
            list={id("domeinen")}
            defaultValue={kaart?.domein ?? ""}
          />
          <datalist id={id("domeinen")}>
            {domeinen.map((domein) => (
              <option key={domein} value={domein} />
            ))}
          </datalist>
        </div>

        <div className="veld">
          <label htmlFor={id("omschrijving")}>Wat hoort erbij</label>
          <textarea
            id={id("omschrijving")}
            name="omschrijving"
            maxLength={GRENZEN.omschrijving}
            defaultValue={kaart?.omschrijving ?? ""}
          />
        </div>

        <div className="veld">
          <label htmlFor={id("goedGenoeg")}>Minimumstandaard: wanneer is het goed genoeg?</label>
          <textarea
            id={id("goedGenoeg")}
            name="goedGenoeg"
            maxLength={GRENZEN.goedGenoeg}
            placeholder="Bv. elke zondag weekmenu klaar, boodschappen in huis voor maandag"
            defaultValue={kaart?.goedGenoeg ?? ""}
          />
        </div>

        <div className="veld">
          <label htmlFor={id("frequentie")}>Hoe vaak</label>
          <select id={id("frequentie")} name="frequentie" defaultValue={kaart?.frequentie ?? "wekelijks"}>
            {FREQUENTIES.map((frequentie) => (
              <option key={frequentie} value={frequentie}>
                {FREQUENTIENAMEN[frequentie]}
              </option>
            ))}
          </select>
        </div>

        <div className="veld">
          <label htmlFor={id("verdeling")}>Hoe wordt deze kaart verdeeld?</label>
          <select
            id={id("verdeling")}
            name="verdeling"
            value={verdeling}
            onChange={(gebeurtenis) => setVerdeling(gebeurtenis.target.value as Verdeling)}
          >
            {VERDELINGEN.map((keuze) => (
              <option key={keuze} value={keuze}>
                {VERDELINGSKEUZES[keuze]}
              </option>
            ))}
          </select>
          <p className="hint">
            Vaste kaarten schat je enkel in op tijd en mentale last, zodat ze meetellen in de weegschaal. Kaarten voor
            elk tellen bij jullie allebei mee; kaarten voor samen tellen niet mee.
          </p>
        </div>

        {verdeling === "elk" ? (
          <div className="veld">
            <label htmlFor={id("vasteUren")}>Vaste uren per week, voor elk</label>
            <input
              id={id("vasteUren")}
              name="vasteUren"
              inputMode="decimal"
              className="kort-getal"
              defaultValue={kaart?.vasteUren === null || kaart?.vasteUren === undefined ? "" : String(kaart.vasteUren).replace(".", ",")}
            />
            <p className="hint">Bv. 5 voor hobbytijd. Leeg laten als jullie de uren elk zelf inschatten.</p>
          </div>
        ) : null}

        {fout ? (
          <p className="melding fout" role="alert">
            {fout}
          </p>
        ) : null}

        <div className="knoppenrij">
          <button type="submit" disabled={bezig}>
            Bewaren
          </button>
          <button type="button" className="stil" onClick={sluit}>
            Annuleren
          </button>
        </div>
      </form>
    </dialog>
  );
}
