"use client";

import { useState } from "react";

import { zetVinkjeActie } from "../acties";

/** Eén punt van de checklist: aanvinken bewaart meteen. Mislukt het, dan springt het vinkje terug. */
export function Vinkje({
  huisId,
  ruimteId,
  sleutel,
  tekst,
  gedaan,
  wie,
}: {
  huisId: number;
  ruimteId: number;
  sleutel: string;
  tekst: string;
  gedaan: boolean;
  wie: string | null;
}) {
  const [aan, setAan] = useState(gedaan);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zet(nieuw: boolean) {
    setAan(nieuw);
    setBezig(true);
    setFout(null);
    const uitkomst = await zetVinkjeActie(huisId, { ruimteId, sleutel, aan: nieuw }).catch(() => ({
      ok: false as const,
      melding: "Bewaren mislukt.",
    }));
    setBezig(false);
    if (!uitkomst.ok) {
      setAan(!nieuw);
      setFout(uitkomst.melding);
    }
  }

  return (
    <li className={aan ? "gedaan" : undefined}>
      <label className="keuzevak">
        <input type="checkbox" checked={aan} disabled={bezig} onChange={(g) => void zet(g.currentTarget.checked)} />
        <span>
          {tekst}
          {aan && wie ? <span className="hulp"> · {wie}</span> : null}
        </span>
      </label>
      {fout ? <span className="melding fout">{fout}</span> : null}
    </li>
  );
}
