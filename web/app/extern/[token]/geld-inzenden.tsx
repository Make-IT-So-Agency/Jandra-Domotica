"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { controleerUpload } from "@/lib/bouw/bestanden";
import { euroBedrag } from "@/lib/bouw/geld";
import { controleerGeldvelden, type Geldvelden } from "@/lib/bouw/linkregels";
import { zetOp } from "@/lib/bouw/zet-op";

import { rondInzendingAfActie, startInzendingActie } from "./acties";

type Geldsoort = "offerte" | "factuur";

const LEEG: Required<Geldvelden> = { bedrag: "", nummer: "", datum: "", vervaldag: "" };

/**
 * Een offerte of factuur insturen via een link: de PDF gaat rechtstreeks naar
 * de privé-opslag, met het bedrag en de datums erbij. Wat de partij intikt,
 * kijkt de browser al na vóór het opladen begint, en de server daarna nog
 * eens.
 */
export function GeldInzenden({ token, soorten, vandaag }: { token: string; soorten: Geldsoort[]; vandaag: string }) {
  const router = useRouter();
  const [soort, setSoort] = useState<Geldsoort>(soorten[0]);
  const [bestand, setBestand] = useState<File | null>(null);
  const [velden, setVelden] = useState<Required<Geldvelden>>({ ...LEEG, datum: soorten[0] === "factuur" ? vandaag : "" });
  const [opmerking, setOpmerking] = useState("");
  const [stand, setStand] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);
  const bezig = stand !== null;
  const zet = (veld: keyof Geldvelden) => (gebeurtenis: { currentTarget: { value: string } }) => {
    const waarde = gebeurtenis.currentTarget.value;
    setVelden((huidig) => ({ ...huidig, [veld]: waarde }));
  };

  function kies(nieuw: Geldsoort) {
    setSoort(nieuw);
    setFout(null);
    setVelden((huidig) => ({ ...huidig, datum: huidig.datum || (nieuw === "factuur" ? vandaag : "") }));
  }

  async function stuur() {
    if (!bestand) return setFout("Kies eerst een PDF.");
    const controle = controleerUpload({ naam: bestand.name, type: bestand.type, grootte: bestand.size }, "document");
    if (!controle.ok) return setFout(controle.melding);
    const gegevens = controleerGeldvelden(soort, velden);
    if (!gegevens.ok) return setFout(gegevens.melding);
    setFout(null);
    setKlaar(null);
    setStand("Voorbereiden…");
    try {
      const start = await startInzendingActie(token, {
        naam: bestand.name,
        type: bestand.type,
        grootte: bestand.size,
        soort,
        velden,
      });
      if (!start.ok) throw new Error(start.melding);
      await zetOp(start.data.uploadUrl, bestand, start.data.contentType, (fractie) =>
        setStand(`Opladen… ${Math.round(fractie * 100)} %`),
      );
      setStand("Nakijken…");
      const afgerond = await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking, soort, velden });
      if (!afgerond.ok) throw new Error(afgerond.melding);
      setKlaar(
        `Je ${soort === "offerte" ? "offerte" : "factuur"} van ${euroBedrag(gegevens.waarde.bedrag ?? 0)} is goed aangekomen. Dank je!`,
      );
      setBestand(null);
      setVelden({ ...LEEG, datum: soort === "factuur" ? vandaag : "" });
      setOpmerking("");
      router.refresh();
    } catch (reden) {
      setFout(reden instanceof Error ? reden.message : "Insturen mislukt. Probeer het opnieuw.");
    } finally {
      setStand(null);
    }
  }

  return (
    <div className="kaart">
      {soorten.length > 1 ? (
        <fieldset className="keuzerij" disabled={bezig}>
          <legend>Wat stuur je in?</legend>
          {soorten.map((mogelijk) => (
            <label key={mogelijk} className="keuzevak">
              <input type="radio" name="geld-soort" checked={soort === mogelijk} onChange={() => kies(mogelijk)} />
              {mogelijk === "offerte" ? "Een offerte" : "Een factuur"}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="veldenrij">
        <div>
          <label htmlFor="geld-bestand">PDF</label>
          <input
            id="geld-bestand"
            type="file"
            accept="application/pdf,.pdf"
            disabled={bezig}
            onChange={(g) => setBestand(g.currentTarget.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label htmlFor="geld-bedrag">Bedrag, inclusief btw (€)</label>
          <input
            id="geld-bedrag"
            inputMode="decimal"
            value={velden.bedrag}
            disabled={bezig}
            placeholder="12.100,00"
            onChange={zet("bedrag")}
          />
        </div>
        {soort === "factuur" ? (
          <div>
            <label htmlFor="geld-nummer">Factuurnummer</label>
            <input id="geld-nummer" value={velden.nummer} maxLength={60} disabled={bezig} onChange={zet("nummer")} />
          </div>
        ) : null}
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor="geld-datum">{soort === "factuur" ? "Factuurdatum" : "Datum van de offerte"}</label>
          <input id="geld-datum" type="date" value={velden.datum} disabled={bezig} onChange={zet("datum")} />
        </div>
        {soort === "factuur" ? (
          <div>
            <label htmlFor="geld-vervaldag">Vervaldag</label>
            <input id="geld-vervaldag" type="date" value={velden.vervaldag} disabled={bezig} onChange={zet("vervaldag")} />
          </div>
        ) : null}
        <div>
          <label htmlFor="geld-opmerking">{soort === "factuur" ? "Waarvoor" : "Omschrijving"}</label>
          <input
            id="geld-opmerking"
            value={opmerking}
            maxLength={1000}
            disabled={bezig}
            placeholder={soort === "factuur" ? "Voorschot 2" : "Ruwbouw volgens lastenboek"}
            onChange={(g) => setOpmerking(g.currentTarget.value)}
          />
        </div>
      </div>
      <div className="knoppenrij" style={{ marginTop: 12 }}>
        <button type="button" disabled={bezig || !bestand} onClick={() => void stuur()}>
          {stand ?? "Insturen"}
        </button>
      </div>
      {klaar ? <div className="melding goed">{klaar}</div> : null}
      {fout ? <div className="melding fout">{fout}</div> : null}
    </div>
  );
}
