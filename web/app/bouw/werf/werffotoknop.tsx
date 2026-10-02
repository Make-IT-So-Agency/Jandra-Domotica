"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { exifDatum } from "@/lib/bouw/exif";
import { verkleinFoto } from "@/lib/bouw/verklein";
import { zetOp } from "@/lib/bouw/zet-op";

import { bewaarWerffotoActie, vraagWerffotoUploadAan } from "./acties";

export interface Ruimtegroep {
  id: number;
  naam: string;
  ruimtes: { id: number; naam: string }[];
}

/** De kleine versie voor de overzichten: genoeg voor een tegel, een fractie van de grootte. */
const DUIM_ZIJDE = 480;

/** Wanneer de foto genomen werd: uit de EXIF, anders het bestand, anders nu. */
async function genomenOp(bestand: File): Promise<string> {
  let exif: string | null = null;
  try {
    // De EXIF staat vooraan; een kwart megabyte is ruim genoeg.
    exif = exifDatum(await bestand.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    exif = null;
  }
  const tijd = exif ? new Date(exif) : new Date(bestand.lastModified || Date.now());
  return Number.isNaN(tijd.getTime()) ? new Date().toISOString() : tijd.toISOString();
}

/**
 * Foto's van de werf opladen, op de gsm of de laptop: meerdere tegelijk, elk
 * verkleind in de browser (zonder EXIF, dus zonder de plaats), met een
 * kleine versie erbij. De dag komt uit de foto zelf, zodat een foto van
 * dinsdag die je woensdag oplaadt, bij dinsdag staat.
 */
export function Werffotoknop({
  groepen = [],
  dagboekId = null,
  opleverpuntId = null,
  standaardRuimte = null,
  compact = false,
  label = "📷 Foto's nemen of kiezen",
}: {
  groepen?: Ruimtegroep[];
  dagboekId?: number | null;
  opleverpuntId?: number | null;
  standaardRuimte?: number | null;
  compact?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [ruimteId, setRuimteId] = useState<number | null>(standaardRuimte);
  const [onderschrift, setOnderschrift] = useState("");
  const [stand, setStand] = useState<string | null>(null);
  const [fouten, setFouten] = useState<string[]>([]);
  const [klaar, setKlaar] = useState<string | null>(null);

  const verdiepingVan = (ruimte: number | null) => groepen.find((groep) => groep.ruimtes.some((r) => r.id === ruimte))?.id ?? null;

  async function laadOp(bestanden: File[]) {
    setFouten([]);
    setKlaar(null);
    const misluktLijst: string[] = [];
    let gelukt = 0;
    for (const [index, bestand] of bestanden.entries()) {
      const nummer = bestanden.length > 1 ? `Foto ${index + 1} van ${bestanden.length}: ` : "";
      try {
        setStand(`${nummer}verkleinen…`);
        const tijd = await genomenOp(bestand);
        const groot = await verkleinFoto(bestand);
        const klein = await verkleinFoto(bestand, DUIM_ZIJDE, 0.72);

        setStand(`${nummer}opladen…`);
        const startGroot = await vraagWerffotoUploadAan({ naam: bestand.name, grootte: groot.size });
        if (!startGroot.ok) throw new Error(startGroot.melding);
        await zetOp(startGroot.data.uploadUrl, groot, startGroot.data.contentType, (fractie) =>
          setStand(`${nummer}opladen… ${Math.round(fractie * 100)} %`),
        );
        const startKlein = await vraagWerffotoUploadAan({ naam: `klein-${bestand.name}`, grootte: klein.size });
        if (!startKlein.ok) throw new Error(startKlein.melding);
        await zetOp(startKlein.data.uploadUrl, klein, startKlein.data.contentType);

        setStand(`${nummer}bewaren…`);
        const bewaard = await bewaarWerffotoActie({
          bestandId: startGroot.data.bestandId,
          duimId: startKlein.data.bestandId,
          genomenOp: tijd,
          ruimteId,
          verdiepingId: verdiepingVan(ruimteId),
          onderschrift,
          dagboekId,
          opleverpuntId,
        });
        if (!bewaard.ok) throw new Error(bewaard.melding);
        gelukt++;
      } catch (reden) {
        misluktLijst.push(`${bestand.name}: ${reden instanceof Error ? reden.message : "opladen mislukt"}`);
      }
    }
    setStand(null);
    setFouten(misluktLijst);
    if (gelukt > 0) {
      setKlaar(gelukt === 1 ? "De foto staat erbij." : `${gelukt} foto's staan erbij.`);
      setOnderschrift("");
      router.refresh();
    }
  }

  const knop = (
    <label className={`knop${compact ? " stil" : " groot"}${stand ? " bezig" : ""}`}>
      {stand ?? label}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={stand !== null}
        onChange={(gebeurtenis) => {
          const gekozen = [...(gebeurtenis.target.files ?? [])];
          gebeurtenis.target.value = "";
          if (gekozen.length > 0) void laadOp(gekozen);
        }}
      />
    </label>
  );

  return (
    <div className={compact ? "werffotoknop compact" : "werffotoknop kaart"}>
      {compact ? null : (
        <div className="veldenrij">
          <div>
            <label htmlFor="werffoto-ruimte">Ruimte</label>
            <select
              id="werffoto-ruimte"
              value={ruimteId ?? ""}
              disabled={stand !== null}
              onChange={(g) => setRuimteId(g.currentTarget.value ? Number(g.currentTarget.value) : null)}
            >
              <option value="">— geen bepaalde ruimte —</option>
              {groepen
                .filter((groep) => groep.ruimtes.length > 0)
                .map((groep) => (
                  <optgroup key={groep.id} label={groep.naam}>
                    {groep.ruimtes.map((ruimte) => (
                      <option key={ruimte.id} value={ruimte.id}>
                        {ruimte.naam}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="werffoto-onderschrift">Onderschrift</label>
            <input
              id="werffoto-onderschrift"
              value={onderschrift}
              maxLength={500}
              disabled={stand !== null}
              placeholder="Leidingen in de muur naast het raam"
              onChange={(g) => setOnderschrift(g.currentTarget.value)}
            />
          </div>
        </div>
      )}
      <div className="knoppenrij" style={compact ? undefined : { marginTop: 12 }}>
        {knop}
      </div>
      {klaar ? <p className="melding goed">{klaar}</p> : null}
      {fouten.length > 0 ? (
        <div className="melding fout">
          {fouten.map((fout) => (
            <p key={fout}>{fout}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
