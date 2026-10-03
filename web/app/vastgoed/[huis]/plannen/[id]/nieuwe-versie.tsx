"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { controleerUpload } from "@/lib/bouw/bestanden";
import { huispad } from "@/lib/bouw/paden";
import { zetOp } from "@/lib/bouw/zet-op";

import { vraagUploadAan, voegVersieToeActie } from "../acties";

interface BestaandePdf {
  id: number;
  naam: string;
  opgeladen: string;
}

type Stap = { soort: "rust" } | { soort: "bezig"; tekst: string; voortgang?: number } | { soort: "fout"; tekst: string };

/**
 * Een nieuwe versie: een nieuwe PDF opladen, of een ander blad kiezen uit een
 * PDF die er al staat (een architect stuurt vaak alle plannen in één bestand).
 *
 * Het bestand gaat rechtstreeks van de browser naar Storage; de server geeft
 * enkel de toelating en kijkt het daarna na.
 */
export function NieuweVersie({
  huisId,
  planId,
  voorstelLabel,
  bestaandePdfs,
}: {
  huisId: number;
  planId: number;
  voorstelLabel: string;
  bestaandePdfs: BestaandePdf[];
}) {
  const router = useRouter();
  const [bron, setBron] = useState<"nieuw" | "bestaand">("nieuw");
  const [stap, setStap] = useState<Stap>({ soort: "rust" });
  const bezig = stap.soort === "bezig";

  async function verstuur(gebeurtenis: FormEvent<HTMLFormElement>) {
    gebeurtenis.preventDefault();
    const formulier = new FormData(gebeurtenis.currentTarget);
    const label = String(formulier.get("label") ?? "").trim();
    const pagina = Number(formulier.get("pagina") ?? 1);
    const datum = String(formulier.get("datum") ?? "") || null;

    if (!label) return setStap({ soort: "fout", tekst: "Geef de versie een label, bv. v3 of vergunning." });
    if (!Number.isInteger(pagina) || pagina < 1) return setStap({ soort: "fout", tekst: "Kies een geldig blad." });

    let bestandId: number;
    if (bron === "bestaand") {
      bestandId = Number(formulier.get("bestand_id"));
      if (!bestandId) return setStap({ soort: "fout", tekst: "Kies een PDF." });
    } else {
      const bestand = formulier.get("bestand");
      if (!(bestand instanceof File) || bestand.size === 0) {
        return setStap({ soort: "fout", tekst: "Kies eerst een PDF." });
      }
      const controle = controleerUpload({ naam: bestand.name, type: bestand.type, grootte: bestand.size }, "plan");
      if (!controle.ok) return setStap({ soort: "fout", tekst: controle.melding });

      setStap({ soort: "bezig", tekst: "Voorbereiden…" });
      const toelating = await vraagUploadAan(huisId, {
        planId,
        label,
        naam: bestand.name,
        type: bestand.type,
        grootte: bestand.size,
      }).catch(() => null);
      if (!toelating) return setStap({ soort: "fout", tekst: "Geen verbinding met de app. Probeer opnieuw." });
      if (!toelating.ok) return setStap({ soort: "fout", tekst: toelating.melding });

      try {
        await zetOp(toelating.data.uploadUrl, bestand, toelating.data.contentType, (voortgang) =>
          setStap({ soort: "bezig", tekst: "Opladen…", voortgang }),
        );
      } catch (fout) {
        return setStap({ soort: "fout", tekst: fout instanceof Error ? fout.message : "Opladen mislukt." });
      }
      bestandId = toelating.data.bestandId;
    }

    setStap({ soort: "bezig", tekst: "Nakijken en bewaren…" });
    const versie = await voegVersieToeActie(huisId, { planId, bestandId, label, pagina, datum }).catch(() => null);
    if (!versie) return setStap({ soort: "fout", tekst: "Geen verbinding met de app. Probeer opnieuw." });
    if (!versie.ok) return setStap({ soort: "fout", tekst: versie.melding });

    setStap({ soort: "rust" });
    router.push(huispad(huisId, `/plannen/${planId}?versie=${versie.data.versieId}`));
    router.refresh();
  }

  return (
    <form className="kaart" onSubmit={verstuur}>
      <fieldset className="keuzerij" disabled={bezig}>
        <legend className="hulp">Waar komt het plan vandaan?</legend>
        <label className="keuzevak">
          <input type="radio" name="bron" checked={bron === "nieuw"} onChange={() => setBron("nieuw")} />
          Een nieuwe PDF opladen
        </label>
        <label className="keuzevak">
          <input
            type="radio"
            name="bron"
            checked={bron === "bestaand"}
            onChange={() => setBron("bestaand")}
            disabled={bestaandePdfs.length === 0}
          />
          Een ander blad uit een PDF die er al staat
        </label>
      </fieldset>

      <div className="veldenrij" style={{ marginTop: 14 }}>
        {bron === "nieuw" ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="bestand">PDF van de architect</label>
            <input id="bestand" name="bestand" type="file" accept="application/pdf,.pdf" disabled={bezig} required />
            <p className="hulp">Tot 50 MB. Het bestand gaat rechtstreeks naar onze privé-opslag.</p>
          </div>
        ) : (
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="bestand_id">PDF</label>
            <select id="bestand_id" name="bestand_id" disabled={bezig}>
              {bestaandePdfs.map((pdf) => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.naam} · {pdf.opgeladen}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="veldenrij">
        <div>
          <label htmlFor="label">Label</label>
          <input id="label" name="label" defaultValue={voorstelLabel} maxLength={40} disabled={bezig} required />
        </div>
        <div>
          <label htmlFor="pagina">Blad in de PDF</label>
          <input id="pagina" name="pagina" type="number" min={1} defaultValue={1} disabled={bezig} required />
        </div>
        <div>
          <label htmlFor="datum">Datum van het plan</label>
          <input id="datum" name="datum" type="date" disabled={bezig} />
        </div>
      </div>

      {stap.soort === "fout" ? <div className="melding fout">{stap.tekst}</div> : null}
      {stap.soort === "bezig" ? (
        <div className="melding info" role="status">
          {stap.tekst}
          {stap.voortgang !== undefined ? (
            <progress className="voortgang" max={1} value={stap.voortgang}>
              {Math.round(stap.voortgang * 100)} %
            </progress>
          ) : null}
        </div>
      ) : null}

      <button type="submit" disabled={bezig}>
        {bezig ? "Even geduld…" : "Versie toevoegen"}
      </button>
    </form>
  );
}
