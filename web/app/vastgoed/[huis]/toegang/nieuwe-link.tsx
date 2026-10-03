"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RECHTNAMEN, standaardRechten, type RechtLink } from "@/lib/bouw/linkregels";
import { PARTIJNAMEN, type SoortPartij } from "@/lib/bouw/types";

import { maakLinkActie } from "./acties";

export interface Linkpartij {
  id: number;
  naam: string;
  soort: SoortPartij;
  email: string | null;
  contactpersoon: string | null;
}

const lang = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });

/**
 * Een link maken voor een partij. Het antwoord toont de link één keer, met
 * een knop om te kopiëren en een om te mailen: de app bewaart enkel de hash.
 */
export function NieuweLink({
  huisId,
  mogelijk,
  partijen,
  vervaldatum,
  afzender,
}: {
  huisId: number;
  /** De rechten die bij het soort huis passen: een bestaand huis heeft geen keuzes, planning of oplevering. */
  mogelijk: RechtLink[];
  partijen: Linkpartij[];
  vervaldatum: string;
  afzender: string;
}) {
  const router = useRouter();
  const eerste = partijen.find((partij) => partij.soort === "architect") ?? partijen[0];
  const [partijId, setPartijId] = useState<number>(eerste?.id ?? 0);
  const standaard = (soort: SoortPartij) => standaardRechten(soort).filter((recht) => mogelijk.includes(recht));
  const [rechten, setRechten] = useState<RechtLink[]>(eerste ? standaard(eerste.soort) : ["plannen"]);
  const [tot, setTot] = useState(vervaldatum);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gemaakt, setGemaakt] = useState<{ url: string; vervaltOp: string; partij: Linkpartij } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const partij = partijen.find((p) => p.id === partijId);

  async function maak() {
    if (!partij) return setFout("Kies voor wie de link is.");
    setFout(null);
    setBezig(true);
    const uitkomst = await maakLinkActie(huisId, { partijId, rechten, vervaltOp: tot }).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) return setFout(uitkomst ? uitkomst.melding : "Geen verbinding met de app.");
    setGemaakt({ ...uitkomst.data, partij });
    setGekopieerd(false);
    router.refresh();
  }

  if (gemaakt) {
    const geldig = lang.format(new Date(gemaakt.vervaltOp));
    const groet = gemaakt.partij.contactpersoon ? `Dag ${gemaakt.partij.contactpersoon},` : "Dag,";
    const mail = `mailto:${gemaakt.partij.email ?? ""}?subject=${encodeURIComponent("Persoonlijke link voor ons bouwproject")}&body=${encodeURIComponent(
      `${groet}\n\nMet deze persoonlijke link kan je ${rechten.map((recht) => RECHTNAMEN[recht].toLowerCase()).join(", ")}:\n\n${gemaakt.url}\n\nDe link werkt tot ${geldig}. Deel hem niet met anderen.\n\nGroeten,\n${afzender}`,
    )}`;
    return (
      <div className="kaart">
        <p>
          <strong>De link voor {gemaakt.partij.naam}</strong>, geldig tot {geldig}:
        </p>
        <input readOnly value={gemaakt.url} onFocus={(g) => g.currentTarget.select()} aria-label="De link" />
        <div className="melding let-op" style={{ marginTop: 10 }}>
          Kopieer of mail hem nu: de app bewaart hem niet, en toont hem niet nog eens. Kwijt? Trek hem in en maak een
          nieuwe.
        </div>
        <div className="knoppenrij" style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(gemaakt.url)
                .then(() => setGekopieerd(true))
                .catch(() => setFout("Kopiëren lukt niet in deze browser; selecteer de link en kopieer hem zelf."))
            }
          >
            {gekopieerd ? "Gekopieerd" : "Kopiëren"}
          </button>
          <a className="knop stil" href={mail}>
            Mailen{gemaakt.partij.email ? ` naar ${gemaakt.partij.email}` : ""}
          </a>
          <button type="button" className="stil" onClick={() => setGemaakt(null)}>
            Klaar
          </button>
        </div>
        {fout ? <div className="melding fout">{fout}</div> : null}
      </div>
    );
  }

  if (partijen.length === 0) {
    return (
      <div className="kaart">
        <p className="leeg">Voeg eerst de architect toe bij de partijen.</p>
      </div>
    );
  }

  return (
    <div className="kaart">
      <div className="veldenrij">
        <div>
          <label htmlFor="link-partij">Voor</label>
          <select
            id="link-partij"
            value={partijId}
            disabled={bezig}
            onChange={(g) => {
              const gekozen = partijen.find((p) => p.id === Number(g.currentTarget.value));
              setPartijId(Number(g.currentTarget.value));
              if (gekozen) setRechten(standaard(gekozen.soort));
            }}
          >
            {partijen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.naam} ({PARTIJNAMEN[p.soort].toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="link-tot">Werkt tot en met</label>
          <input id="link-tot" type="date" value={tot} disabled={bezig} onChange={(g) => setTot(g.currentTarget.value)} />
        </div>
      </div>
      <fieldset className="keuzerij">
        <legend>Wat de link mag</legend>
        {mogelijk.map((recht) => (
          <label key={recht} className="keuzevak">
            <input
              type="checkbox"
              checked={rechten.includes(recht)}
              disabled={bezig}
              onChange={(g) => {
                // Eerst lezen: currentTarget is leeg tegen dat React de update uitvoert.
                const aan = g.currentTarget.checked;
                setRechten((huidig) =>
                  aan ? mogelijk.filter((r) => r === recht || huidig.includes(r)) : huidig.filter((r) => r !== recht),
                );
              }}
            />
            {RECHTNAMEN[recht]}
          </label>
        ))}
      </fieldset>
      <div className="knoppenrij" style={{ marginTop: 12 }}>
        <button type="button" disabled={bezig} onClick={() => void maak()}>
          {bezig ? "Bezig…" : "Maak de link"}
        </button>
      </div>
      {fout ? <div className="melding fout">{fout}</div> : null}
    </div>
  );
}
