"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { verkleinFoto } from "@/lib/bouw/verklein";
import { zetOp } from "@/lib/bouw/zet-op";

import { bewaarFotoActie, vraagFotoUploadAan } from "../acties";

/**
 * Een foto bij een optie: kiezen (of trekken, op een gsm), verkleinen in de
 * browser, rechtstreeks naar Storage, en dan bevestigen bij de server.
 */
export function Fotoknop({ huisId, optieId, heeftFoto }: { huisId: number; optieId: number; heeftFoto: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function laadOp(bestand: File) {
    setFout(null);
    setBezig("Verkleinen…");
    try {
      const foto = await verkleinFoto(bestand);
      setBezig("Opladen…");
      const start = await vraagFotoUploadAan(huisId, { optieId, naam: bestand.name, grootte: foto.size });
      if (!start.ok) throw new Error(start.melding);
      await zetOp(start.data.uploadUrl, foto, start.data.contentType, (fractie) =>
        setBezig(`Opladen… ${Math.round(fractie * 100)} %`),
      );
      setBezig("Bewaren…");
      const klaar = await bewaarFotoActie(huisId, { optieId, bestandId: start.data.bestandId });
      if (!klaar.ok) throw new Error(klaar.melding);
      router.refresh();
    } catch (reden) {
      setFout(reden instanceof Error ? reden.message : "Opladen mislukt.");
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="fotoknop">
      <label className={`knop stil${bezig ? " bezig" : ""}`}>
        {bezig ?? (heeftFoto ? "Andere foto" : "Foto toevoegen")}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={bezig !== null}
          onChange={(gebeurtenis) => {
            const bestand = gebeurtenis.target.files?.[0];
            gebeurtenis.target.value = "";
            if (bestand) void laadOp(bestand);
          }}
        />
      </label>
      {fout ? <p className="melding fout">{fout}</p> : null}
    </div>
  );
}
