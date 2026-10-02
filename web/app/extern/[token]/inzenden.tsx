"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { controleerUpload } from "@/lib/bouw/bestanden";
import { zetOp } from "@/lib/bouw/zet-op";

import { rondInzendingAfActie, startInzendingActie } from "./acties";

/**
 * Een PDF insturen via een link: rechtstreeks naar de privé-opslag, met een
 * opmerking erbij. Het komt niet meteen bij de plannen: Jan en Sandra lezen
 * het eerst in.
 */
export function Inzenden({ token }: { token: string }) {
  const router = useRouter();
  const [bestand, setBestand] = useState<File | null>(null);
  const [opmerking, setOpmerking] = useState("");
  const [stand, setStand] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);

  async function stuur() {
    if (!bestand) return setFout("Kies eerst een PDF.");
    const controle = controleerUpload({ naam: bestand.name, type: bestand.type, grootte: bestand.size }, "plan");
    if (!controle.ok) return setFout(controle.melding);
    setFout(null);
    setKlaar(null);
    setStand("Voorbereiden…");
    try {
      const start = await startInzendingActie(token, { naam: bestand.name, type: bestand.type, grootte: bestand.size });
      if (!start.ok) throw new Error(start.melding);
      await zetOp(start.data.uploadUrl, bestand, start.data.contentType, (fractie) =>
        setStand(`Opladen… ${Math.round(fractie * 100)} %`),
      );
      setStand("Nakijken…");
      const afgerond = await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking });
      if (!afgerond.ok) throw new Error(afgerond.melding);
      setKlaar(`${bestand.name} is goed aangekomen. Dank je!`);
      setBestand(null);
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
      <div className="veldenrij">
        <div>
          <label htmlFor="inzending-bestand">PDF</label>
          <input
            id="inzending-bestand"
            type="file"
            accept="application/pdf,.pdf"
            disabled={stand !== null}
            onChange={(g) => setBestand(g.currentTarget.files?.[0] ?? null)}
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label htmlFor="inzending-opmerking">Opmerking</label>
          <input
            id="inzending-opmerking"
            value={opmerking}
            maxLength={1000}
            disabled={stand !== null}
            placeholder="Wat is er gewijzigd?"
            onChange={(g) => setOpmerking(g.currentTarget.value)}
          />
        </div>
      </div>
      <div className="knoppenrij" style={{ marginTop: 12 }}>
        <button type="button" disabled={stand !== null || !bestand} onClick={() => void stuur()}>
          {stand ?? "Insturen"}
        </button>
      </div>
      {klaar ? <div className="melding goed">{klaar}</div> : null}
      {fout ? <div className="melding fout">{fout}</div> : null}
    </div>
  );
}
