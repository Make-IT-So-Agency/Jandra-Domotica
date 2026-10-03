"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { Punt as Schermpunt } from "@/lib/bouw/beeld";
import { getal } from "@/lib/bouw/invoer";
import { kaderVan, naarHuis, naarPagina, type Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { huispad } from "@/lib/bouw/paden";
import {
  CATALOGUS,
  CATEGORIEEN,
  CATEGORIEKLEUREN,
  CATEGORIENAMEN,
  STATUSNAMEN,
  STATUSSEN_PUNT,
  hoogteTekst,
  ruimteVan,
  soortVan,
  standaardHoogte,
  type Punt,
  type Ruimtevorm,
  type StatusPunt,
} from "@/lib/bouw/punten";

import { usePlanblad } from "../plannen/[id]/planblad";
import { Planvlak } from "../plannen/[id]/planvlak";
import { verwijderPuntActie, voegPuntToeActie, wijzigPuntActie } from "./acties";

export interface Puntengegevens {
  verdieping: { id: number; naam: string; plafondhoogte_m: number | null };
  versie: { id: number; bestandId: number; pagina: number; kalibratie: Kalibratie };
  ruimtes: Ruimtevorm[];
  punten: Punt[];
}

type Modus = "kijken" | "plaatsen" | "verplaatsen";

function pad(ringen: Xy[][], k: Kalibratie): string {
  return ringen
    .map((ring) => `M${ring.map((p) => naarPagina(p, k).map((w) => w.toFixed(1)).join(",")).join("L")}Z`)
    .join("");
}

/**
 * Punten op het plan zetten: kies een soort, tik op het plan. Elk punt wordt
 * meteen bewaard, in meter, zodat het een nieuwe versie van het plan
 * overleeft. Op een laptop of tablet.
 */
export default function Puntenplan({ huisId, gegevens }: { huisId: number; gegevens: Puntengegevens }) {
  const { verdieping, versie, ruimtes } = gegevens;
  const router = useRouter();
  const { blad, fout } = usePlanblad(huisId, versie.id, versie.bestandId, versie.pagina);
  const k = versie.kalibratie;

  const [klein, setKlein] = useState(false);
  const [punten, setPunten] = useState<Punt[]>(gegevens.punten);
  const [soort, setSoort] = useState("lichtpunt");
  const [modus, setModus] = useState<Modus>("kijken");
  const [gekozen, setGekozen] = useState<number | null>(null);
  const [melding, setMelding] = useState<{ soort: "fout" | "info"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    const vraag = window.matchMedia("(max-width: 599px)");
    const zet = () => setKlein(vraag.matches);
    zet();
    vraag.addEventListener("change", zet);
    return () => vraag.removeEventListener("change", zet);
  }, []);

  const gekozenPunt = punten.find((p) => p.id === gekozen) ?? null;
  // Bij het begin het gebouw in beeld: de ruimtes, met wat marge.
  const start = useMemo(() => {
    const hoeken = ruimtes.flatMap((r) => (r.veelhoek[0] ?? []).map((p) => naarPagina(p, k)));
    if (hoeken.length === 0) return null;
    const kader = kaderVan(hoeken);
    const marge = 1.5 / k.meterPerPunt;
    return { x: kader.x0 - marge, y: kader.y0 - marge, breedte: kader.x1 - kader.x0 + 2 * marge, hoogte: kader.y1 - kader.y0 + 2 * marge };
  }, [ruimtes, k]);
  const perRuimte = useMemo(() => {
    const tellingen = new Map<number | null, number>();
    for (const punt of punten) {
      const ruimte = ruimteVan(punt, ruimtes);
      tellingen.set(ruimte, (tellingen.get(ruimte) ?? 0) + punt.aantal);
    }
    return tellingen;
  }, [punten, ruimtes]);

  async function zetPunt(p: Xy) {
    const [x_m, y_m] = naarHuis(p, k);
    setBezig(true);
    const uitkomst = await voegPuntToeActie(huisId, {
      verdiepingId: verdieping.id,
      punt: { soort, x_m, y_m, hoogte_m: standaardHoogte(soort), aantal: 1, label: null, opmerking: null, status: "gewenst" },
    }).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) {
      return setMelding({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
    }
    setPunten((huidig) => [...huidig, uitkomst.data]);
    setGekozen(uitkomst.data.id);
  }

  async function bewaar(punt: Punt, wijzigingen: Partial<Punt>): Promise<boolean> {
    const nieuw = { ...punt, ...wijzigingen };
    setBezig(true);
    const uitkomst = await wijzigPuntActie(huisId, { id: punt.id, punt: nieuw }).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) {
      setMelding({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
      return false;
    }
    setPunten((huidig) => huidig.map((p) => (p.id === punt.id ? uitkomst.data : p)));
    return true;
  }

  async function verwijder(punt: Punt) {
    if (!window.confirm(`${soortVan(punt.soort)?.naam ?? "Dit punt"} verwijderen?`)) return;
    setBezig(true);
    const uitkomst = await verwijderPuntActie(huisId, punt.id).catch(() => null);
    setBezig(false);
    if (!uitkomst || !uitkomst.ok) {
      return setMelding({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
    }
    setPunten((huidig) => huidig.filter((p) => p.id !== punt.id));
    setGekozen(null);
  }

  const opTik = (scherm: Schermpunt, zoom: number) => {
    const p: Xy = [scherm.x, scherm.y];
    setMelding(null);
    if (bezig) return;
    if (modus === "plaatsen") return void zetPunt(p);
    if (modus === "verplaatsen" && gekozenPunt) {
      const [x_m, y_m] = naarHuis(p, k);
      void bewaar(gekozenPunt, { x_m: Math.round(x_m * 1000) / 1000, y_m: Math.round(y_m * 1000) / 1000 });
      return setModus("kijken");
    }
    // Het dichtste punt binnen een kleine afstand op het scherm.
    const straal = 14 / zoom;
    let beste: { id: number; afstand: number } | null = null;
    for (const punt of punten) {
      const [px, py] = naarPagina([punt.x_m, punt.y_m], k);
      const afstand = Math.hypot(px - p[0], py - p[1]);
      if (afstand <= straal && (!beste || afstand < beste.afstand)) beste = { id: punt.id, afstand };
    }
    setGekozen(beste ? beste.id : null);
  };

  if (klein) {
    return (
      <div className="melding let-op">
        Punten zetten gaat op een laptop of tablet. Hieronder staat de lijst per ruimte; de wensenlijst kan je
        ook hier openen.
      </div>
    );
  }
  if (fout) return <div className="melding fout">{fout}</div>;
  if (!blad) {
    return (
      <div className="viewer">
        <div className="viewer-leeg">Plan laden…</div>
      </div>
    );
  }

  const laag = (zoom: number) => (
    <>
      {ruimtes.map((ruimte) => (
        <path key={ruimte.id} d={pad(ruimte.veelhoek, k)} fillRule="evenodd" className="laag-ruimte licht" />
      ))}
      {punten.map((punt) => {
        const [x, y] = naarPagina([punt.x_m, punt.y_m], k);
        const gekend = soortVan(punt.soort);
        const kleur = CATEGORIEKLEUREN[gekend?.categorie ?? "andere"];
        const r = 9 / zoom;
        return (
          <g key={punt.id} className={punt.id === gekozen ? "laag-puntsymbool gekozen" : "laag-puntsymbool"}>
            <circle cx={x} cy={y} r={r} fill={kleur} stroke="#ffffff" strokeWidth={1.5 / zoom} />
            <text x={x} y={y} dy={r * 0.36} fontSize={(gekend?.code.length ?? 1) > 2 ? 6 / zoom : 8 / zoom}>
              {gekend?.code ?? "?"}
            </text>
            {punt.aantal > 1 ? (
              <text x={x + r} y={y - r} fontSize={7 / zoom} className="laag-puntaantal">
                {punt.aantal}×
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );

  const uitleg =
    modus === "plaatsen"
      ? `Tik op het plan om een ${soortVan(soort)?.naam.toLowerCase()} te zetten. Elke tik zet er een bij.`
      : modus === "verplaatsen"
        ? "Tik waar het punt moet komen."
        : "Tik op een punt om het te wijzigen.";

  return (
    <div className="omzetten">
      <div>
        <Planvlak
          blad={blad}
          laag={laag}
          opTik={opTik}
          klasse={modus === "kijken" ? undefined : "tikken"}
          start={start}
          info={uitleg}
          label="Het plan met de punten"
        />
      </div>

      <div className="omzetten-zijbalk">
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}

        {gekozenPunt ? (
          <Puntformulier
            key={`${gekozenPunt.id}-${gekozenPunt.x_m}-${gekozenPunt.y_m}`}
            punt={gekozenPunt}
            plafondhoogte={verdieping.plafondhoogte_m}
            bezig={bezig}
            opBewaren={(wijzigingen) => bewaar(gekozenPunt, wijzigingen)}
            opVerplaatsen={() => setModus("verplaatsen")}
            opVerwijderen={() => void verwijder(gekozenPunt)}
            opSluiten={() => setGekozen(null)}
            fout={(tekst) => setMelding({ soort: "fout", tekst })}
          />
        ) : null}

        <section className="kaart">
          <h3>Punt zetten</h3>
          {CATEGORIEEN.map((categorie) => (
            <div key={categorie} className="palet">
              <div className="palet-kop" style={{ color: CATEGORIEKLEUREN[categorie] }}>
                {CATEGORIENAMEN[categorie]}
              </div>
              <div className="palet-knoppen">
                {CATALOGUS.filter((s) => s.categorie === categorie).map((s) => (
                  <button
                    key={s.soort}
                    type="button"
                    className={`stil palet-knop${modus === "plaatsen" && soort === s.soort ? " gekozen" : ""}`}
                    onClick={() => {
                      setSoort(s.soort);
                      setModus("plaatsen");
                      setGekozen(null);
                    }}
                    title={s.naam}
                  >
                    <span className="palet-code" style={{ background: CATEGORIEKLEUREN[categorie] }}>
                      {s.code}
                    </span>
                    {s.naam}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {modus !== "kijken" ? (
            <button type="button" className="stil" onClick={() => setModus("kijken")}>
              Klaar met zetten
            </button>
          ) : null}
        </section>

        <section className="kaart">
          <h3>
            Per ruimte <span className="hulp">· {punten.reduce((som, p) => som + p.aantal, 0)} punten</span>
          </h3>
          <ul className="wijzigingen">
            {ruimtes
              .filter((r) => perRuimte.has(r.id))
              .map((r) => (
                <li key={r.id}>
                  {r.naam}: {perRuimte.get(r.id)}
                </li>
              ))}
            {perRuimte.has(null) ? <li>Buiten of zonder ruimte: {perRuimte.get(null)}</li> : null}
          </ul>
          <div className="knoppenrij" style={{ marginTop: 10 }}>
            <button type="button" className="stil" onClick={() => router.push(huispad(huisId, "/punten/wensenlijst"))}>
              Naar de wensenlijst
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Puntformulier({
  punt,
  plafondhoogte,
  bezig,
  opBewaren,
  opVerplaatsen,
  opVerwijderen,
  opSluiten,
  fout,
}: {
  punt: Punt;
  plafondhoogte: number | null;
  bezig: boolean;
  opBewaren: (wijzigingen: Partial<Punt>) => Promise<boolean>;
  opVerplaatsen: () => void;
  opVerwijderen: () => void;
  opSluiten: () => void;
  fout: (tekst: string) => void;
}) {
  const [soort, setSoort] = useState(punt.soort);
  const [hoogte, setHoogte] = useState(punt.hoogte_m === null ? "" : String(punt.hoogte_m).replace(".", ","));
  const [aantal, setAantal] = useState(String(punt.aantal));
  const [label, setLabel] = useState(punt.label ?? "");
  const [opmerking, setOpmerking] = useState(punt.opmerking ?? "");
  const [status, setStatus] = useState<StatusPunt>(punt.status);
  const gekend = soortVan(soort);

  async function bewaar() {
    const h = getal(hoogte, "De hoogte");
    if (!h.ok) return fout(h.melding);
    const n = Number(aantal);
    if (!Number.isInteger(n) || n < 1 || n > 99) return fout("Het aantal ligt tussen 1 en 99.");
    await opBewaren({ soort, hoogte_m: h.waarde, aantal: n, label: label.trim() || null, opmerking: opmerking.trim() || null, status });
  }

  return (
    <section className="kaart">
      <h3>
        <span className="palet-code" style={{ background: CATEGORIEKLEUREN[gekend?.categorie ?? "andere"] }}>
          {gekend?.code ?? "?"}
        </span>{" "}
        {gekend?.naam ?? punt.soort}
      </h3>
      <div className="veldenrij">
        <div>
          <label htmlFor="punt-soort">Soort</label>
          <select
            id="punt-soort"
            value={soort}
            onChange={(g) => {
              const nieuw = g.currentTarget.value;
              setSoort(nieuw);
              const standaard = standaardHoogte(nieuw);
              setHoogte(standaard === null ? "" : String(standaard).replace(".", ","));
            }}
          >
            {CATEGORIEEN.map((categorie) => (
              <optgroup key={categorie} label={CATEGORIENAMEN[categorie]}>
                {CATALOGUS.filter((s) => s.categorie === categorie).map((s) => (
                  <option key={s.soort} value={s.soort}>
                    {s.code} · {s.naam}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor="punt-hoogte">Hoogte (m)</label>
          <input
            id="punt-hoogte"
            inputMode="decimal"
            value={hoogte}
            placeholder={hoogteTekst(null, plafondhoogte)}
            onChange={(g) => setHoogte(g.currentTarget.value)}
          />
        </div>
        <div>
          <label htmlFor="punt-aantal">Aantal</label>
          <input id="punt-aantal" inputMode="numeric" value={aantal} onChange={(g) => setAantal(g.currentTarget.value)} />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor="punt-label">Label</label>
          <input id="punt-label" value={label} maxLength={40} placeholder="bv. boven het bed" onChange={(g) => setLabel(g.currentTarget.value)} />
        </div>
        <div>
          <label htmlFor="punt-status">Stand</label>
          <select id="punt-status" value={status} onChange={(g) => setStatus(g.currentTarget.value as StatusPunt)}>
            {STATUSSEN_PUNT.map((s) => (
              <option key={s} value={s}>
                {STATUSNAMEN[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="veldenrij">
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="punt-opmerking">Opmerking</label>
          <input id="punt-opmerking" value={opmerking} maxLength={300} onChange={(g) => setOpmerking(g.currentTarget.value)} />
        </div>
      </div>
      <div className="knoppenrij">
        <button type="button" onClick={() => void bewaar()} disabled={bezig}>
          Bewaren
        </button>
        <button type="button" className="stil" onClick={opVerplaatsen} disabled={bezig}>
          Verplaatsen
        </button>
        <button type="button" className="gevaar" onClick={opVerwijderen} disabled={bezig}>
          Verwijderen
        </button>
        <button type="button" className="stil" onClick={opSluiten}>
          Sluiten
        </button>
      </div>
    </section>
  );
}
