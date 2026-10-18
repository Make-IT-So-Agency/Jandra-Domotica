"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Staalbeeld } from "@/components/bouw/staal";
import {
  PATRONEN_MET_STUKKEN,
  kleurenUitPalet,
  leesFoto,
  paletVan,
  patroonVoorStaal,
  type Fotolezing,
  type Fotostaal,
} from "@/lib/bouw/drie/fotostaal";
import type { Materiaal, Slot } from "@/lib/bouw/drie/materialen";
import { MET_VOEG, PATRONEN, PATROONNAMEN, isPatroon, type Patroon } from "@/lib/bouw/keuzes";
import { verkleinFoto } from "@/lib/bouw/verklein";
import { zetOp } from "@/lib/bouw/zet-op";

import { bewaarMateriaalActie, vraagMateriaalfotoAan } from "./acties";

/**
 * Een materiaal van een site of foto, in de bibliotheek: plak het adres van
 * een productpagina (of van een foto), of kies foto's van je toestel. De
 * app toont de foto's en leest ze zelf:
 * - een staal (één steen, tegel of plank op een effen achtergrond) vult in 3D
 *   elke steen, tegel of plank van het patroon, op echte maat;
 * - een referentie (een huis of een ruimte met dat materiaal) geeft de
 *   kleuren en de voeg; duid je er een recht stuk op aan, dan ligt dat stuk
 *   als foto op de muur, zo breed als je opgeeft.
 * Toevoegen laadt de foto's verkleind op en maakt er een optie van bij de
 * keuze van het onderdeel; meteen daarna ligt het materiaal op wat je
 * aantikte. Enkel voor de browser; de regels staan in
 * lib/bouw/drie/fotostaal.ts, het ophalen in lib/bouw/ophalen.ts.
 */

type Uitsnede = [number, number, number, number];
type Lezing = Fotolezing & { palet: { kleur: string; aandeel: number }[] };

/** Een foto om uit te kiezen: van een site (via de app, zodat de browser haar mag lezen), van het toestel, of een beeld van het huis. */
interface Kandidaat {
  sleutel: string;
  voorbeeld: string;
  bron: { soort: "site"; url: string } | { soort: "bestand"; bestand: File } | { soort: "beeld"; id: number };
  lezing: Lezing | null;
  fout: boolean;
}

/** Een beeld van het huis, zoals een render (zie beelden.tsx): ook daar kan een materiaal uit komen. */
export interface Importbeeld {
  id: number;
  titel: string;
  /** Een ondertekende URL uit Storage; die mag de browser lezen. */
  url: string | null;
}

export interface Geimporteerd {
  naam: string;
  optieId: number;
  /** De keuze waar het bij kwam. */
  titel: string;
  /** Om meteen te tonen, met de foto van hier: na het herladen komt die uit Storage. */
  materiaal: Materiaal;
}

const fotoViaApp = (huisId: number, url: string) => `/api/bouw/materiaal/foto?huis=${huisId}&url=${encodeURIComponent(url)}`;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Leest een foto in het klein: wat voor foto, waar het staal staat, en de kleuren. */
function analyseer(beeld: HTMLImageElement): Lezing {
  const schaal = Math.min(1, 320 / Math.max(beeld.naturalWidth, beeld.naturalHeight));
  const breedte = Math.max(1, Math.round(beeld.naturalWidth * schaal));
  const hoogte = Math.max(1, Math.round(beeld.naturalHeight * schaal));
  const doek = document.createElement("canvas");
  doek.width = breedte;
  doek.height = hoogte;
  const ctx = doek.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Geen canvas.");
  ctx.drawImage(beeld, 0, 0, breedte, hoogte);
  const pixels = { breedte, hoogte, data: ctx.getImageData(0, 0, breedte, hoogte).data };
  const lezing = leesFoto(pixels);
  return { ...lezing, palet: paletVan(pixels, lezing.uitsnede, 4, lezing.achtergrond ? rgb(lezing.achtergrond) : null) };
}

const binnen = (waarde: number) => Math.max(0, Math.min(1, waarde));

/** Een foto waarop je een rechthoek trekt: het staal, of een recht stuk muur. */
function Uitsnedekader({ voorbeeld, waarde, wijzig, label }: { voorbeeld: string; waarde: Uitsnede | null; wijzig: (u: Uitsnede) => void; label: string }) {
  const vak = useRef<HTMLDivElement>(null);
  const begin = useRef<{ x: number; y: number } | null>(null);
  const [trek, setTrek] = useState<Uitsnede | null>(null);
  const plek = (g: ReactPointerEvent) => {
    const r = vak.current!.getBoundingClientRect();
    return { x: binnen((g.clientX - r.left) / r.width), y: binnen((g.clientY - r.top) / r.height) };
  };
  const rechthoek = (a: { x: number; y: number }, b: { x: number; y: number }): Uitsnede => [
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x, b.x),
    Math.max(a.y, b.y),
  ];
  const toon = trek ?? waarde;
  return (
    <div
      ref={vak}
      className="uitsnedekader"
      role="img"
      aria-label={label}
      onPointerDown={(g) => {
        g.currentTarget.setPointerCapture(g.pointerId);
        begin.current = plek(g);
        setTrek(null);
      }}
      onPointerMove={(g) => {
        if (begin.current) setTrek(rechthoek(begin.current, plek(g)));
      }}
      onPointerUp={(g) => {
        const start = begin.current;
        begin.current = null;
        setTrek(null);
        if (!start) return;
        const u = rechthoek(start, plek(g));
        // Een tik zonder slepen, of een heel klein vak: dan niet.
        if (u[2] - u[0] >= 0.03 && u[3] - u[1] >= 0.03) wijzig(u);
      }}
      onPointerCancel={() => {
        begin.current = null;
        setTrek(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- een foto van een andere site, via de app */}
      <img src={voorbeeld} alt="" draggable={false} crossOrigin="anonymous" />
      {toon ? (
        <div
          className="uitsnede"
          style={{ left: `${toon[0] * 100}%`, top: `${toon[1] * 100}%`, width: `${(toon[2] - toon[0]) * 100}%`, height: `${(toon[3] - toon[1]) * 100}%` }}
        />
      ) : null}
    </div>
  );
}

export function Materiaalimport({
  huisId,
  slot,
  ruimteId,
  keuzeId,
  klaar,
  beelden = [],
}: {
  huisId: number;
  /** Het onderdeel: bepaalt welk patroon past en bij welke keuze de optie komt. */
  slot: Slot;
  /** Bij een vloer: de ruimte. */
  ruimteId: number | null;
  /** De keuze die het onderdeel volgt, of null: dan zoekt of maakt de server ze. */
  keuzeId: number | null;
  klaar: (uit: Geimporteerd) => void;
  /** De beelden van het huis: een render toont vaak het fineer of het werkblad. */
  beelden?: readonly Importbeeld[];
}) {
  const [adres, setAdres] = useState("");
  const [site, setSite] = useState<string | null>(null);
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([]);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [rollen, setRollen] = useState<{ staal: string | null; referentie: string | null }>({ staal: null, referentie: null });
  const [naam, setNaam] = useState("");
  const [patroon, setPatroon] = useState<Patroon | null>(null);
  const [kleur, setKleur] = useState("#9a9a9a");
  const [voeg, setVoeg] = useState<string | null>(null);
  const [staaluitsnede, setStaaluitsnede] = useState<Uitsnede | null>(null);
  const [vlak, setVlak] = useState<Uitsnede | null>(null);
  const [breedte, setBreedte] = useState("100");
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [toegevoegd, setToegevoegd] = useState<string | null>(null);
  const teller = useRef(0);
  /** Koos je zelf een rol, dan verdeelt de app niets meer. */
  const handmatig = useRef(false);

  const kandidaat = (sleutel: string | null) => kandidaten.find((k) => k.sleutel === sleutel) ?? null;
  const staal = kandidaat(rollen.staal);
  const referentie = kandidaat(rollen.referentie);

  /** Wat de app voorstelt bij een nieuwe rolverdeling: het patroon, de kleur en de voeg. */
  function stelVoor(nieuweStaal: Kandidaat | null, nieuweReferentie: Kandidaat | null) {
    const uitReferentie = nieuweReferentie?.lezing ? kleurenUitPalet(nieuweReferentie.lezing.palet) : null;
    if (nieuweStaal?.lezing) {
      setStaaluitsnede(nieuweStaal.lezing.uitsnede);
      setPatroon(patroonVoorStaal(slot, nieuweStaal.lezing.verhouding));
      setKleur(nieuweStaal.lezing.palet[0]?.kleur ?? kleur);
      // De voeg staat niet op de foto van één steen: dan uit de referentie.
      setVoeg(uitReferentie?.voegkleur ?? null);
    } else if (uitReferentie) {
      setKleur(uitReferentie.kleur);
      setVoeg(uitReferentie.voegkleur);
      setPatroon(slot === "gevel" ? "baksteen" : null);
    }
    setVlak(null);
  }

  function zetRol(sleutel: string, rol: "staal" | "referentie" | null) {
    handmatig.current = true;
    const nieuw = {
      staal: rol === "staal" ? sleutel : rollen.staal === sleutel ? null : rollen.staal,
      referentie: rol === "referentie" ? sleutel : rollen.referentie === sleutel ? null : rollen.referentie,
    };
    setRollen(nieuw);
    stelVoor(kandidaat(nieuw.staal), kandidaat(nieuw.referentie));
  }

  function gelezen(sleutel: string, lezing: Lezing | null) {
    setKandidaten((oud) => oud.map((k) => (k.sleutel === sleutel ? { ...k, lezing, fout: lezing === null } : k)));
  }

  // Een foto is gelezen: de eerste staal en de eerste referentie krijgen vanzelf hun rol, tot je zelf kiest.
  useEffect(() => {
    if (handmatig.current) return;
    const eersteStaal = rollen.staal ?? kandidaten.find((k) => k.lezing?.soort === "staal")?.sleutel ?? null;
    const eersteReferentie = rollen.referentie ?? kandidaten.find((k) => k.lezing?.soort === "vlak" && k.sleutel !== eersteStaal)?.sleutel ?? null;
    if (eersteStaal === rollen.staal && eersteReferentie === rollen.referentie) return;
    setRollen({ staal: eersteStaal, referentie: eersteReferentie });
    const vind = (s: string | null) => kandidaten.find((k) => k.sleutel === s) ?? null;
    stelVoor(vind(eersteStaal), vind(eersteReferentie));
    // Enkel als er een foto bij komt of gelezen is: de rollen en het voorstel lezen we hier enkel.
  }, [kandidaten]);

  function begin(lijst: Kandidaat[], titel: string | null) {
    handmatig.current = false;
    setKandidaten(lijst);
    setRollen({ staal: null, referentie: null });
    setGekozen(null);
    setNaam((titel ?? "").slice(0, 80));
    setPatroon(null);
    setVoeg(null);
    setStaaluitsnede(null);
    setVlak(null);
  }

  async function zoek() {
    setFout(null);
    setToegevoegd(null);
    setBezig("Zoeken…");
    try {
      const antwoord = await fetch(`/api/bouw/materiaal/zoek?huis=${huisId}&url=${encodeURIComponent(adres.trim())}`);
      const data = (await antwoord.json().catch(() => ({}))) as { titel?: string | null; fotos?: string[]; error?: string };
      if (!antwoord.ok) throw new Error(data.error ?? "Deze site lezen lukt niet.");
      const fotos = data.fotos ?? [];
      if (fotos.length === 0) throw new Error("Geen foto's gevonden op deze pagina. Plak het adres van de foto zelf, of kies een foto van je toestel.");
      setSite(adres.trim().startsWith("http") ? adres.trim() : `https://${adres.trim()}`);
      begin(
        fotos.map((url) => ({ sleutel: `s${teller.current++}`, voorbeeld: fotoViaApp(huisId, url), bron: { soort: "site", url }, lezing: null, fout: false })),
        data.titel ?? null,
      );
    } catch (reden) {
      setFout(reden instanceof Error ? reden.message : "Zoeken mislukt.");
    } finally {
      setBezig(null);
    }
  }

  function kiesBestanden(bestanden: FileList | null) {
    if (!bestanden || bestanden.length === 0) return;
    setFout(null);
    setSite(null);
    begin(
      [...bestanden].slice(0, 12).map((bestand) => ({
        sleutel: `b${teller.current++}`,
        voorbeeld: URL.createObjectURL(bestand),
        bron: { soort: "bestand", bestand },
        lezing: null,
        fout: false,
      })),
      bestanden[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "),
    );
  }

  const metStukken = patroon !== null && PATRONEN_MET_STUKKEN.includes(patroon);
  const cm = Number(breedte.replace(",", "."));
  const breedteGoed = Number.isFinite(cm) && cm >= 2 && cm <= 3000;
  const fotostaal: Fotostaal | null = staal
    ? { bron: "staal", uitsnede: staaluitsnede ?? staal.lezing?.uitsnede ?? [0, 0, 1, 1], breedte: metStukken ? null : cm / 100 }
    : referentie && vlak
      ? { bron: "vlak", uitsnede: vlak, breedte: cm / 100 }
      : null;
  const voorbeeld: Materiaal = {
    kleur,
    patroon,
    voegkleur: patroon && MET_VOEG.includes(patroon) ? voeg : null,
    foto: fotostaal ? (staal ?? referentie)!.voorbeeld : null,
    staal: fotostaal,
  };
  const kanToevoegen = (staal || referentie) && naam.trim().length > 0 && (!fotostaal || fotostaal.breedte === null || breedteGoed) && bezig === null;

  async function laadOp(k: Kandidaat): Promise<number> {
    const blob = k.bron.soort === "bestand" ? k.bron.bestand : await (await fetch(k.voorbeeld)).blob();
    const foto = await verkleinFoto(blob);
    const start = await vraagMateriaalfotoAan(huisId, { naam: k.bron.soort === "bestand" ? k.bron.bestand.name : k.bron.soort === "beeld" ? "beeld.jpg" : "materiaal.jpg", grootte: foto.size });
    if (!start.ok) throw new Error(start.melding);
    await zetOp(start.data.uploadUrl, foto, start.data.contentType, () => undefined);
    return start.data.bestandId;
  }

  async function voegToe() {
    if (!kanToevoegen) return;
    setFout(null);
    try {
      setBezig("Foto's opladen…");
      const staalId = staal ? await laadOp(staal) : null;
      const referentieId = referentie && referentie !== staal ? await laadOp(referentie) : null;
      setBezig("Bewaren…");
      const fotos = staal
        ? { foto: staalId, referentie: referentieId, staal: fotostaal }
        : vlak
          ? { foto: referentieId, referentie: null, staal: fotostaal }
          : { foto: null, referentie: referentieId, staal: null };
      const uitkomst = await bewaarMateriaalActie(huisId, {
        slot,
        ruimteId: slot === "vloer" ? ruimteId : null,
        keuzeId,
        naam: naam.trim(),
        kleur,
        patroon,
        voegkleur: voorbeeld.voegkleur,
        fotos,
        url: site,
      });
      if (!uitkomst.ok) throw new Error(uitkomst.melding);
      klaar({ naam: uitkomst.data.naam, optieId: uitkomst.data.optieId, titel: uitkomst.data.titel, materiaal: voorbeeld });
      setToegevoegd(`${uitkomst.data.naam} staat in de bibliotheek, als optie bij ${uitkomst.data.titel}.`);
      begin([], null);
      setAdres("");
      setSite(null);
    } catch (reden) {
      setFout(reden instanceof Error ? reden.message : "Toevoegen mislukt.");
    } finally {
      setBezig(null);
    }
  }

  const gekozenKandidaat = kandidaat(gekozen);

  return (
    <div className="materiaalimport">
      <label htmlFor="materiaal-adres">Adres van een site of een foto</label>
      <div className="importzoek">
        <input
          id="materiaal-adres"
          inputMode="url"
          placeholder="https://…"
          value={adres}
          onChange={(g) => setAdres(g.currentTarget.value)}
          onKeyDown={(g) => {
            if (g.key === "Enter" && adres.trim()) void zoek();
          }}
        />
        <button type="button" disabled={!adres.trim() || bezig !== null} onClick={() => void zoek()}>
          Zoeken
        </button>
      </div>
      <label className="knop stil importbestand">
        Of kies foto&apos;s van je toestel
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(g) => {
            kiesBestanden(g.currentTarget.files);
            g.currentTarget.value = "";
          }}
        />
      </label>
      {beelden.some((b) => b.url) ? (
        <>
          <p className="hulp" style={{ marginBottom: 4 }}>
            Of uit een beeld van het huis, zoals een render: duid er een recht stuk fineer of werkblad op aan.
          </p>
          <div className="importfotos">
            {beelden.map((b) =>
              b.url ? (
                <button
                  key={b.id}
                  type="button"
                  className="importfoto"
                  title={b.titel}
                  onClick={() => {
                    setFout(null);
                    setSite(null);
                    begin([{ sleutel: `b${teller.current++}`, voorbeeld: b.url!, bron: { soort: "beeld", id: b.id }, lezing: null, fout: false }], b.titel);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- een beeld uit Storage */}
                  <img src={b.url} alt={b.titel} crossOrigin="anonymous" />
                </button>
              ) : null,
            )}
          </div>
        </>
      ) : null}
      {bezig ? <p className="hulp">{bezig}</p> : null}
      {fout ? <p className="melding fout">{fout}</p> : null}
      {toegevoegd ? <p className="melding goed">{toegevoegd}</p> : null}

      {kandidaten.length > 0 ? (
        <>
          <p className="hulp">
            Tik een foto aan en zeg wat ze toont: één steen, tegel of plank (een staal), of het materiaal in het echt, zoals een huis met
            die steen (een referentie). De app stelde al iets voor.
          </p>
          <div className="importfotos">
            {kandidaten.map((k) => {
              const rol = rollen.staal === k.sleutel ? "Staal" : rollen.referentie === k.sleutel ? "Referentie" : null;
              return (
                <button
                  key={k.sleutel}
                  type="button"
                  className={`importfoto${gekozen === k.sleutel ? " gekozen" : ""}${k.fout ? " kapot" : ""}`}
                  aria-pressed={gekozen === k.sleutel}
                  onClick={() => setGekozen(gekozen === k.sleutel ? null : k.sleutel)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- een foto van een andere site, via de app */}
                  <img
                    src={k.voorbeeld}
                    alt=""
                    // Een beeld uit Storage komt van elders: zo mag de browser zijn pixels lezen.
                    crossOrigin={k.bron.soort === "beeld" ? "anonymous" : undefined}
                    onLoad={(g) => {
                      if (k.lezing) return;
                      let lezing: Lezing | null = null;
                      try {
                        lezing = analyseer(g.currentTarget);
                      } catch {
                        lezing = null;
                      }
                      gelezen(k.sleutel, lezing);
                    }}
                    onError={() => gelezen(k.sleutel, null)}
                  />
                  {rol ? <span className="importrol">{rol}</span> : null}
                </button>
              );
            })}
          </div>
          {gekozenKandidaat ? (
            <div className="knoppenrij" role="group" aria-label="Wat toont deze foto?">
              <button type="button" className={rollen.staal === gekozen ? "" : "stil"} onClick={() => zetRol(gekozenKandidaat.sleutel, "staal")}>
                Staal: één steen, tegel of plank
              </button>
              <button type="button" className={rollen.referentie === gekozen ? "" : "stil"} onClick={() => zetRol(gekozenKandidaat.sleutel, "referentie")}>
                Referentie: in het echt
              </button>
              <button type="button" className="stil" onClick={() => zetRol(gekozenKandidaat.sleutel, null)}>
                Niet gebruiken
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {staal ? (
        <div className="importdeel">
          <p className="staalkop">Het staal</p>
          <Uitsnedekader voorbeeld={staal.voorbeeld} waarde={staaluitsnede} wijzig={setStaaluitsnede} label="Het staal: trek een rechthoek rond het deel dat telt" />
          <p className="hulp">
            {metStukken
              ? `In 3D krijgt elke ${patroon === "tegels" ? "tegel" : patroon === "planken" || patroon === "parket" ? "plank" : patroon === "pannen" || patroon === "leien" ? "pan of lei" : "steen"} een stukje van wat in het kader staat, op echte maat. Trek een ander kader als het niet klopt.`
              : "Zonder patroon met stenen, tegels of planken ligt wat in het kader staat als foto op het vlak, zo breed als hieronder."}
          </p>
        </div>
      ) : null}
      {referentie && !staal ? (
        <div className="importdeel">
          <p className="staalkop">De referentie</p>
          <Uitsnedekader voorbeeld={referentie.voorbeeld} waarde={vlak} wijzig={setVlak} label="De referentie: trek een rechthoek rond een recht stuk muur of vloer" />
          <p className="hulp">
            {vlak
              ? "Dat stuk ligt als foto op het vlak, zo breed als hieronder. Een recht stuk, van voren gezien, werkt het best."
              : "De app neemt de kleuren en de voeg uit deze foto. Trek een rechthoek rond een recht stuk muur of vloer om de foto zelf te gebruiken."}
          </p>
          {vlak ? (
            <button type="button" className="stil" onClick={() => setVlak(null)}>
              Enkel de kleuren
            </button>
          ) : null}
        </div>
      ) : null}

      {staal || referentie ? (
        <div className="importdeel">
          <div className="veldenrij">
            <div>
              <label htmlFor="import-patroon">Patroon</label>
              <select
                id="import-patroon"
                value={patroon ?? ""}
                onChange={(g) => {
                  const waarde = g.currentTarget.value;
                  setPatroon(isPatroon(waarde) ? waarde : null);
                }}
              >
                <option value="">Geen</option>
                {PATRONEN.map((p) => (
                  <option key={p} value={p}>
                    {PATROONNAMEN[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="import-kleur">Kleur</label>
              <div className="kleurveld">
                <input id="import-kleur" type="color" value={kleur} onChange={(g) => setKleur(g.currentTarget.value.toLowerCase())} />
              </div>
            </div>
            {patroon && MET_VOEG.includes(patroon) ? (
              <div>
                <label htmlFor="import-voeg">Voeg</label>
                <div className="kleurveld">
                  <input id="import-voeg" type="color" value={voeg ?? "#c9c2b8"} onChange={(g) => setVoeg(g.currentTarget.value.toLowerCase())} />
                </div>
              </div>
            ) : null}
            {fotostaal && fotostaal.breedte !== null ? (
              <div>
                <label htmlFor="import-breedte">Breedte in het echt (cm)</label>
                <input id="import-breedte" inputMode="decimal" value={breedte} onChange={(g) => setBreedte(g.currentTarget.value)} />
              </div>
            ) : null}
          </div>
          <div className="importvoorbeeld">
            <Staalbeeld materiaal={voorbeeld} className="staal-vlak" />
            <div style={{ flex: 1 }}>
              <label htmlFor="import-naam">Naam</label>
              <input id="import-naam" maxLength={80} value={naam} onChange={(g) => setNaam(g.currentTarget.value)} />
            </div>
          </div>
          {fotostaal && fotostaal.breedte !== null && !breedteGoed ? <p className="melding fout">Geef een breedte tussen 2 en 3000 cm.</p> : null}
          <div className="knoppenrij">
            <button type="button" disabled={!kanToevoegen} onClick={() => void voegToe()}>
              Toevoegen aan de bibliotheek
            </button>
          </div>
          <p className="hulp">
            Komt als optie bij de keuze van dit onderdeel, met de foto&apos;s en de site. Kiezen doe je bij de keuze.
          </p>
        </div>
      ) : null}
    </div>
  );
}
