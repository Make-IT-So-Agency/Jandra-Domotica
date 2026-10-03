"use client";

import { useEffect, useRef, useState } from "react";

import { controleerUpload } from "@/lib/bouw/bestanden";
import { zetOp } from "@/lib/bouw/zet-op";

import { vraagDocumentUploadAan } from "./acties";

/**
 * Een PDF bij een offerte of factuur, in een gewoon formulier. Het bestand
 * gaat meteen rechtstreeks naar Storage; het formulier krijgt enkel het id
 * mee, in een verborgen veld. De serveractie rondt de upload af.
 *
 * Het bestandsveld zelf heeft geen naam: zo gaat het bestand nooit mee met
 * het formulier naar de server. Zolang het opladen loopt, houdt dit veld het
 * formulier tegen.
 */
export function Documentveld({ huisId, id, label = "PDF" }: { huisId: number; id: string; label?: string }) {
  const verborgen = useRef<HTMLInputElement>(null);
  const bezigNu = useRef(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<{ id: number; naam: string } | null>(null);

  useEffect(() => {
    const formulier = verborgen.current?.form;
    if (!formulier) return;
    const tegenhouden = (gebeurtenis: SubmitEvent) => {
      if (bezigNu.current) {
        gebeurtenis.preventDefault();
        setFout("Even wachten: de PDF is nog aan het opladen.");
        return;
      }
      // Na het versturen is de PDF van dit formulier gebruikt. Pas na deze
      // gebeurtenis leegmaken: React leest het formulier pas verderop uit.
      window.setTimeout(() => setKlaar(null), 0);
    };
    formulier.addEventListener("submit", tegenhouden);
    return () => formulier.removeEventListener("submit", tegenhouden);
  }, []);

  async function laadOp(bestand: File) {
    setFout(null);
    setKlaar(null);
    const aanbod = { naam: bestand.name, type: bestand.type, grootte: bestand.size };
    const controle = controleerUpload(aanbod, "document");
    if (!controle.ok) {
      setFout(controle.melding);
      return;
    }
    bezigNu.current = true;
    setBezig("Opladen…");
    try {
      const start = await vraagDocumentUploadAan(huisId, aanbod);
      if (!start.ok) throw new Error(start.melding);
      await zetOp(start.data.uploadUrl, bestand, start.data.contentType, (fractie) =>
        setBezig(`Opladen… ${Math.round(fractie * 100)} %`),
      );
      setKlaar({ id: start.data.bestandId, naam: bestand.name });
    } catch (reden) {
      setFout(reden instanceof Error ? reden.message : "Opladen mislukt.");
    } finally {
      bezigNu.current = false;
      setBezig(null);
    }
  }

  return (
    <div className="documentveld">
      <label htmlFor={id}>{label}</label>
      <input ref={verborgen} type="hidden" name="bestand_id" value={klaar?.id ?? ""} />
      <div className="documentveld-rij">
        <label className={`knop stil${bezig ? " bezig" : ""}`}>
          {bezig ?? (klaar ? "Andere PDF" : "PDF kiezen")}
          <input
            id={id}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            disabled={bezig !== null}
            onChange={(gebeurtenis) => {
              const bestand = gebeurtenis.target.files?.[0];
              gebeurtenis.target.value = "";
              if (bestand) void laadOp(bestand);
            }}
          />
        </label>
        {klaar ? <span className="hulp">✔ {klaar.naam}</span> : null}
      </div>
      {fout ? <p className="melding fout">{fout}</p> : null}
    </div>
  );
}
