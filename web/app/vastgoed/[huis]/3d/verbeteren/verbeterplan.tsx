"use client";

import { useEffect, useMemo, useState } from "react";

import type { Punt as Schermpunt } from "@/lib/bouw/beeld";
import {
  BIJ_OPENING,
  DIKTES,
  GATNAMEN,
  GATSOORTEN,
  eindeOpMuur,
  muurLangs,
  opAs,
  opMuur,
  pasCorrectiesToe,
  rechtGezet,
  strook,
  stukVanMuur,
  vlakVanGat,
  type Correctie,
  type Muurplek,
  type Toegepasteluifel,
} from "@/lib/bouw/drie/correcties";
import { boogpunten, type Draai } from "@/lib/bouw/drie/deuren";
import { hartVan, type Gat, type Gatsoort, type Gekendeopening } from "@/lib/bouw/drie/gaten";
import { LUIFELDIKTE, type Gekendeluifel } from "@/lib/bouw/drie/luifels";
import { binnenVeelhoeken, vereniging, type Veelhoek } from "@/lib/bouw/drie/vlak";
import { getal } from "@/lib/bouw/invoer";
import { kaderVan, naarHuis, naarPagina, type Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { huispad } from "@/lib/bouw/paden";

import { usePlanblad } from "../../plannen/[id]/planblad";
import { Planvlak } from "../../plannen/[id]/planvlak";
import { bewaarCorrectiesActie } from "../acties";

export interface Verbetergegevens {
  verdieping: { id: number; naam: string; plafond: number };
  versie: { id: number; bestandId: number; pagina: number; kalibratie: Kalibratie };
  ruimtes: { id: number; naam: string; ringen: Xy[][] }[];
  /** De muren uit de omzetting, in meter. */
  muren: Xy[][];
  openingen: Gekendeopening[];
  /** De luifels die de omzetting op het plan vond, in meter. */
  luifels: Gekendeluifel[];
  correcties: Correctie[];
}

type Gereedschap = "kijken" | "muur" | "weg" | "opening" | "luifel";

/** Een gekozen luifel: een eigen (haar correctie), of een van het plan (waar je tikte). */
type Luifelkeuze = { bron: "zelf"; correctie: number } | { bron: "plan"; punt: Xy };

interface Luifelmaat {
  diepte: number;
  /** Null: de app kiest de onderkant. */
  onder: number | null;
  dikte: number;
}

interface Openingmaat {
  gat: Gatsoort;
  breedte: number;
  hoogte: number;
  borstwering: number;
}

/** Een nieuw raam of een nieuwe deur, als je nog niets koos. */
const STANDAARD: Record<Gatsoort, Openingmaat> = {
  raam: { gat: "raam", breedte: 1.2, hoogte: 1.25, borstwering: 0.9 },
  buitendeur: { gat: "buitendeur", breedte: 1, hoogte: 2.15, borstwering: 0 },
  deur: { gat: "deur", breedte: 0.93, hoogte: 2.15, borstwering: 0 },
  doorgang: { gat: "doorgang", breedte: 0.9, hoogte: 2.15, borstwering: 0 },
};

const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;
const rond = (p: Xy): Xy => [mm(p[0]), mm(p[1])];
const plus = (a: Xy, b: Xy, f = 1): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];
const tussen = (a: Xy, b: Xy): Xy => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const afstand = (a: Xy, b: Xy) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const meter = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m`;
const komma = (waarde: number) => String(Math.round(waarde * 100) / 100).replace(".", ",");
const breedteVan = (gat: Gat) => afstand(gat.a, gat.b);

function pad(veelhoeken: readonly Veelhoek[], k: Kalibratie): string {
  return veelhoeken
    .flatMap((veelhoek) => veelhoek)
    .map((ring) => `M${ring.map((p) => naarPagina(p, k).map((w) => w.toFixed(2)).join(",")).join("L")}Z`)
    .join("");
}

const cm = (waarde: number) => `${Math.round(waarde * 100)} cm`;
const luifelhoogte = (c: { onder?: number; dikte: number }) =>
  `${c.onder === undefined ? "onderkant tegen de ramen eronder" : `onderkant op ${meter(c.onder)}`}, ${cm(c.dikte)} dik`;
const hoogtetekst = (c: { onder: number; boven: number }) => (c.onder > 0.005 ? `van ${meter(c.onder)} tot ${meter(c.boven)}` : `${meter(c.boven)} hoog`);
const draaitekst = (draai: Draai | undefined) =>
  [draai?.scharnier ? ", scharnier aan de andere kant" : "", draai?.kant ? ", draait naar de andere kant" : ""].join("");

/** Het pad van de bogen van een deur op het plan: het blad open, en de boog tot waar het dicht is. */
function deurpad(gat: Gat, k: Kalibratie): string {
  return (gat.bladen ?? [])
    .flatMap((blad) => {
      const boog = boogpunten(blad);
      if (!boog) return [];
      const [h, o] = [naarPagina(blad.scharnier, k), naarPagina(blad.open, k)];
      const punten = boog.map((p) => naarPagina(p, k).map((w) => w.toFixed(2)).join(","));
      return [`M${h[0].toFixed(2)},${h[1].toFixed(2)}L${o[0].toFixed(2)},${o[1].toFixed(2)}`, `M${punten.join("L")}`];
    })
    .join("");
}

/** Een correctie in woorden, voor de lijst. */
function beschrijving(c: Correctie): string {
  switch (c.soort) {
    case "muur":
      return `Muur erbij, ${meter(afstand(c.a, c.b))} lang en ${Math.round(c.dikte * 100)} cm dik`;
    case "weg":
      return `Muur weg over ${meter(afstand(c.a, c.b))}`;
    case "opening":
      return `${GATNAMEN[c.gat]} erbij, ${meter(afstand(c.a, c.b))} breed, ${hoogtetekst(c)}${draaitekst(c.draai)}`;
    case "gat":
      return `Opening wordt ${GATNAMEN[c.gat].toLowerCase()}${c.breedte !== undefined ? ` van ${meter(c.breedte)} breed` : ""}, ${hoogtetekst(c)}${draaitekst(c.draai)}`;
    case "dicht":
      return "Opening dicht";
    case "luifel":
      return `Luifel erbij, ${meter(afstand(c.a, c.b))} lang en ${meter(c.diepte)} diep, ${luifelhoogte(c)}`;
    case "luifelmaat":
      return `Luifel van het plan: ${luifelhoogte(c)}`;
    case "luifelweg":
      return "Luifel van het plan weg";
  }
}

/** Waarom een correctie niets meer raakt. */
function nietsMeer(c: Correctie): string {
  if (c.soort === "luifel") return "hier ligt geen gevel meer";
  if (c.soort === "luifelmaat" || c.soort === "luifelweg") return "hier ligt geen luifel meer";
  return "hier ligt geen muur of opening meer";
}

/**
 * Muren, ramen en deuren verbeteren op het plan: tik, en het plan toont
 * meteen wat 3D bouwt. Alles samen bewaren. Op een laptop of tablet; op een
 * gsm enkel bekijken.
 */
export default function Verbeterplan({ huisId, gegevens }: { huisId: number; gegevens: Verbetergegevens }) {
  const { verdieping, versie, ruimtes, muren, openingen, luifels } = gegevens;
  const k = versie.kalibratie;
  const { blad, fout } = usePlanblad(huisId, versie.id, versie.bestandId, versie.pagina);

  const [klein, setKlein] = useState(false);
  const [bewaard, setBewaard] = useState<Correctie[]>(gegevens.correcties);
  const [correcties, setCorrecties] = useState<Correctie[]>(gegevens.correcties);
  const [gereedschap, setGereedschap] = useState<Gereedschap>("kijken");
  const [begin, setBegin] = useState<{ punt: Xy; plek: Muurplek | null } | null>(null);
  const [dikte, setDikte] = useState<number>(0.14);
  const [nieuw, setNieuw] = useState<Openingmaat>(STANDAARD.raam);
  const [nieuweLuifel, setNieuweLuifel] = useState<{ diepte: number; dikte: number }>({ diepte: 1, dikte: LUIFELDIKTE });
  const [gekozen, setGekozen] = useState<Xy | null>(null);
  const [gekozenLuifel, setGekozenLuifel] = useState<Luifelkeuze | null>(null);
  const [melding, setMelding] = useState<{ soort: "fout" | "goed"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    const vraag = window.matchMedia("(max-width: 599px)");
    const zet = () => setKlein(vraag.matches);
    zet();
    vraag.addEventListener("change", zet);
    return () => vraag.removeEventListener("change", zet);
  }, []);

  const omgezet = useMemo(() => vereniging(muren.map((ring) => [ring])), [muren]);
  // Hetzelfde rekenwerk als het 3D-model: wat je hier ziet, bouwt 3D.
  const uitkomst = useMemo(
    () => pasCorrectiesToe(omgezet, ruimtes, openingen, verdieping.plafond, correcties, luifels),
    [omgezet, ruimtes, openingen, verdieping.plafond, correcties, luifels],
  );
  const veranderd = JSON.stringify(correcties) !== JSON.stringify(bewaard);

  // Niet bewaard, en de pagina weg? Dan vraagt de browser het eerst.
  useEffect(() => {
    if (!veranderd) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [veranderd]);

  const gekozenGat = gekozen ? (uitkomst.gaten.find((gat) => afstand(hartVan(gat), gekozen) <= 0.3) ?? null) : null;
  const gekozenLuifelVlak = gekozenLuifel
    ? (uitkomst.luifels.find((luifel) =>
        gekozenLuifel.bron === "zelf"
          ? luifel.bron === "zelf" && luifel.correctie === gekozenLuifel.correctie
          : luifel.bron === "plan" && binnenVeelhoeken(gekozenLuifel.punt, luifel.veelhoeken),
      ) ?? null)
    : null;

  // Bij het begin het gebouw in beeld, met wat marge.
  const start = useMemo(() => {
    const hoeken = [...ruimtes.flatMap((r) => r.ringen[0] ?? []), ...muren.flat()].map((p) => naarPagina(p, k));
    if (hoeken.length === 0) return null;
    const kader = kaderVan(hoeken);
    const marge = 1.5 / k.meterPerPunt;
    return { x: kader.x0 - marge, y: kader.y0 - marge, breedte: kader.x1 - kader.x0 + 2 * marge, hoogte: kader.y1 - kader.y0 + 2 * marge };
  }, [ruimtes, muren, k]);

  function voegToe(correctie: Correctie) {
    setCorrecties((huidig) => [...huidig, correctie]);
  }

  function kies(nieuwGereedschap: Gereedschap) {
    setGereedschap((huidig) => (huidig === nieuwGereedschap ? "kijken" : nieuwGereedschap));
    setBegin(null);
    setGekozen(null);
    setGekozenLuifel(null);
    setMelding(null);
  }

  const opTik = (scherm: Schermpunt, zoom: number) => {
    if (bezig) return;
    setMelding(null);
    const p = naarHuis([scherm.x, scherm.y], k);
    // Een tik kleeft tot 16 pixels naast een muur, en minstens 15 cm.
    const bereik = Math.max(0.15, (16 / zoom) * k.meterPerPunt);

    if (gereedschap === "muur") {
      if (!begin) {
        const plek = opMuur(uitkomst.muren, p, bereik);
        setBegin({ punt: plek ? plek.punt : p, plek });
        return;
      }
      const einde = eindeOpMuur(begin.punt, rechtGezet(begin.punt, p, uitkomst.muren), uitkomst.muren, bereik);
      setBegin(null);
      if (afstand(begin.punt, einde) < 0.1) return setMelding({ soort: "fout", tekst: "Die muur is te kort. Tik het begin en het einde van de nieuwe muur." });
      voegToe({ soort: "muur", a: rond(begin.punt), b: rond(einde), dikte });
      return;
    }

    if (gereedschap === "weg") {
      if (!begin) {
        const plek = opMuur(uitkomst.muren, p, bereik);
        if (!plek) return setMelding({ soort: "fout", tekst: "Tik op een muur." });
        setBegin({ punt: plek.punt, plek });
        return;
      }
      const einde = begin.plek ? opAs(begin.plek, p) : p;
      setBegin(null);
      if (afstand(begin.punt, einde) < 0.05) return setMelding({ soort: "fout", tekst: "Dat stuk is te kort. Tik het begin en het einde langs de muur." });
      voegToe({ soort: "weg", a: rond(begin.punt), b: rond(einde) });
      return;
    }

    if (gereedschap === "opening") {
      const plek = opMuur(uitkomst.muren, p, bereik);
      if (!plek) return setMelding({ soort: "fout", tekst: "Tik op een muur: daar komt het midden van de opening." });
      const onder = nieuw.gat === "raam" ? nieuw.borstwering : 0;
      voegToe({
        soort: "opening",
        a: rond(plus(plek.punt, plek.richting, -nieuw.breedte / 2)),
        b: rond(plus(plek.punt, plek.richting, nieuw.breedte / 2)),
        gat: nieuw.gat,
        onder: mm(onder),
        boven: mm(Math.min(verdieping.plafond, onder + nieuw.hoogte)),
      });
      return;
    }

    if (gereedschap === "luifel") {
      if (!begin) {
        // Waar je tikte: in een hoek is nog niet zeker langs welke muur. Dat zegt de tweede tik.
        if (!opMuur(uitkomst.muren, p, bereik)) return setMelding({ soort: "fout", tekst: "Tik op de gevel, waar de luifel begint." });
        setBegin({ punt: p, plek: null });
        return;
      }
      setBegin(null);
      if (afstand(begin.punt, p) < 0.3) return setMelding({ soort: "fout", tekst: "Die luifel is te kort. Tik het begin en het einde langs de gevel." });
      // De muur tussen de twee tikken, en beide op haar as.
      const plek = muurLangs(uitkomst.muren, begin.punt, p);
      if (!plek) return setMelding({ soort: "fout", tekst: "Tik het begin en het einde langs dezelfde gevel." });
      const [a, b] = [opAs(plek, begin.punt), opAs(plek, p)];
      const luifel: Correctie = { soort: "luifel", a: rond(a), b: rond(b), diepte: nieuweLuifel.diepte, dikte: nieuweLuifel.dikte };
      // Enkel tegen een gevel: tegen een binnenmuur komt geen luifel.
      const proef = pasCorrectiesToe(omgezet, ruimtes, openingen, verdieping.plafond, [...correcties, luifel], luifels);
      if (!proef.verslag[correcties.length]) return setMelding({ soort: "fout", tekst: "Hier komt geen luifel: tik langs een buitenmuur." });
      voegToe(luifel);
      // Meteen gekozen: zo zie je welke onderkant de app koos, en pas je die aan.
      setGereedschap("kijken");
      setGekozenLuifel({ bron: "zelf", correctie: correcties.length });
      return;
    }

    // Kijken: een raam, deur of doorgang kiezen om aan te passen, of een luifel.
    const inGat = uitkomst.gaten.find((gat) => binnenVeelhoeken(p, [vlakVanGat(gat)]));
    const luifel = inGat ? undefined : uitkomst.luifels.find((l) => binnenVeelhoeken(p, l.veelhoeken));
    if (luifel) {
      setGekozen(null);
      setGekozenLuifel(
        luifel.bron === "zelf" && luifel.correctie !== undefined ? { bron: "zelf", correctie: luifel.correctie } : { bron: "plan", punt: rond(p) },
      );
      return;
    }
    const geraakt =
      inGat ??
      [...uitkomst.gaten].sort((a, b) => afstand(hartVan(a), p) - afstand(hartVan(b), p)).find((gat) => afstand(hartVan(gat), p) <= bereik + gat.dikte);
    setGekozenLuifel(null);
    setGekozen(geraakt ? hartVan(geraakt) : null);
  };

  /** Het hele stuk muur weg, van waar je tikte tot de volgende muur of het einde. */
  function heelStuk() {
    if (!begin?.plek) return;
    const stuk = stukVanMuur(uitkomst.muren, begin.plek);
    setBegin(null);
    voegToe({ soort: "weg", a: rond(stuk.a), b: rond(stuk.b) });
  }

  /** Een opening aanpassen of dichtmaken. Een opening die je zelf maakte, past haar eigen correctie aan. */
  function pasGatAan(gat: Gat, maat: Openingmaat | null) {
    const hart = hartVan(gat);
    const eigen = correcties.findIndex(
      (c) => c.soort === "opening" && afstand(tussen(c.a, c.b), hart) <= Math.max(BIJ_OPENING, gat.dikte),
    );
    const zonder = correcties.filter(
      (c, i) => i !== eigen && !((c.soort === "gat" || c.soort === "dicht") && afstand([c.x, c.y], hart) <= BIJ_OPENING),
    );
    if (!maat) {
      // Dicht: een eigen opening valt gewoon weg.
      setCorrecties(eigen >= 0 ? zonder : [...zonder, { soort: "dicht", x: mm(hart[0]), y: mm(hart[1]) }]);
      setGekozen(null);
      return;
    }
    const onder = maat.gat === "raam" ? maat.borstwering : 0;
    const hoogtes = { gat: maat.gat, onder: mm(onder), boven: mm(Math.min(verdieping.plafond, onder + maat.hoogte)) };
    if (eigen >= 0) {
      const oud = correcties[eigen] as Extract<Correctie, { soort: "opening" }>;
      const midden = tussen(oud.a, oud.b);
      const u: Xy = [(oud.b[0] - oud.a[0]) / afstand(oud.a, oud.b), (oud.b[1] - oud.a[1]) / afstand(oud.a, oud.b)];
      const vervanging: Correctie = {
        soort: "opening",
        a: rond(plus(midden, u, -maat.breedte / 2)),
        b: rond(plus(midden, u, maat.breedte / 2)),
        ...hoogtes,
        ...(oud.draai ? { draai: oud.draai } : {}),
      };
      setCorrecties(correcties.map((c, i) => (i === eigen ? vervanging : c)));
      return;
    }
    const breder = Math.abs(maat.breedte - breedteVan(gat)) > 0.01 ? { breedte: mm(maat.breedte) } : {};
    // Hoe de deur draaide, blijft.
    const vorig = correcties.find((c) => c.soort === "gat" && afstand([c.x, c.y], hart) <= BIJ_OPENING);
    const draai = vorig?.soort === "gat" && vorig.draai ? { draai: vorig.draai } : {};
    setCorrecties([...zonder, { soort: "gat", x: mm(hart[0]), y: mm(hart[1]), ...hoogtes, ...breder, ...draai }]);
  }

  /** Een deur anders laten draaien: het scharnier aan de andere kant, of naar de andere kant open. */
  function draaiDeur(gat: Gat, welk: keyof Draai) {
    const hart = hartVan(gat);
    const wissel = (draai: Draai | undefined): { draai?: Draai } => {
      const nieuw: Draai = { ...draai, [welk]: !draai?.[welk] };
      const schoon: Draai = { ...(nieuw.scharnier ? { scharnier: true } : {}), ...(nieuw.kant ? { kant: true } : {}) };
      return schoon.scharnier || schoon.kant ? { draai: schoon } : {};
    };
    const eigen = correcties.findIndex(
      (c) => c.soort === "opening" && afstand(tussen(c.a, c.b), hart) <= Math.max(BIJ_OPENING, gat.dikte),
    );
    const bestaand = eigen >= 0 ? eigen : correcties.findIndex((c) => c.soort === "gat" && afstand([c.x, c.y], hart) <= BIJ_OPENING);
    if (bestaand >= 0) {
      setCorrecties(
        correcties.map((c, i) => {
          if (i !== bestaand || (c.soort !== "opening" && c.soort !== "gat")) return c;
          const { draai, ...rest } = c;
          return { ...rest, ...wissel(draai) } as Correctie;
        }),
      );
      return;
    }
    setCorrecties([
      ...correcties,
      { soort: "gat", x: mm(hart[0]), y: mm(hart[1]), gat: gat.soort, onder: mm(gat.onder), boven: mm(gat.boven), ...wissel(undefined) },
    ]);
  }

  /**
   * Een luifel andere maten geven, of (zonder maat) weg. Een eigen luifel past
   * haar eigen correctie aan; een van het plan krijgt er een.
   */
  function pasLuifelAan(keuze: Luifelkeuze, luifel: Toegepasteluifel, maat: Luifelmaat | null) {
    if (keuze.bron === "zelf") {
      const oud = correcties[keuze.correctie];
      if (oud?.soort !== "luifel") return;
      if (!maat) {
        setCorrecties(correcties.filter((_, i) => i !== keuze.correctie));
        setGekozenLuifel(null);
        return;
      }
      const vervanging: Correctie = {
        soort: "luifel",
        a: oud.a,
        b: oud.b,
        diepte: mm(maat.diepte),
        ...(maat.onder === null ? {} : { onder: mm(maat.onder) }),
        dikte: mm(maat.dikte),
      };
      setCorrecties(correcties.map((c, i) => (i === keuze.correctie ? vervanging : c)));
      return;
    }
    // Van het plan: wat er al voor deze luifel stond, maakt plaats.
    const zonder = correcties.filter(
      (c) => !((c.soort === "luifelmaat" || c.soort === "luifelweg") && binnenVeelhoeken([c.x, c.y], luifel.veelhoeken)),
    );
    const [x, y] = rond(keuze.punt);
    if (!maat) {
      setCorrecties([...zonder, { soort: "luifelweg", x, y }]);
      setGekozenLuifel(null);
      return;
    }
    const anders = maat.onder !== null || Math.abs(maat.dikte - LUIFELDIKTE) > 0.0005;
    setCorrecties(
      anders ? [...zonder, { soort: "luifelmaat", x, y, ...(maat.onder === null ? {} : { onder: mm(maat.onder) }), dikte: mm(maat.dikte) }] : zonder,
    );
  }

  async function bewaar() {
    setBezig(true);
    const uitkomstActie = await bewaarCorrectiesActie(huisId, { verdiepingId: verdieping.id, correcties }).catch(() => null);
    setBezig(false);
    if (!uitkomstActie || !uitkomstActie.ok) {
      setMelding({ soort: "fout", tekst: uitkomstActie ? uitkomstActie.melding : "Geen verbinding met de app." });
      return;
    }
    setBewaard(correcties);
    setMelding({ soort: "goed", tekst: "Bewaard. Het 3D-model bouwt nu met deze verbeteringen." });
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
        <path key={ruimte.id} d={pad([ruimte.ringen], k)} fillRule="evenodd" className="laag-ruimte licht" />
      ))}
      {uitkomst.luifels.map((luifel, i) => (
        <path
          key={`l${i}`}
          d={pad(luifel.veelhoeken, k)}
          fillRule="evenodd"
          className={`laag-luifelvlak${luifel === gekozenLuifelVlak ? " gekozen" : ""}`}
        />
      ))}
      <path d={pad(uitkomst.muren, k)} fillRule="evenodd" className="laag-muur" />
      {uitkomst.open.length > 0 ? <path d={pad(uitkomst.open, k)} fillRule="evenodd" className="laag-muurweg" /> : null}
      {uitkomst.gaten.map((gat, i) => (
        <path key={i} d={pad([vlakVanGat(gat)], k)} className={`laag-gat ${gat.soort}${gat === gekozenGat ? " gekozen" : ""}`} />
      ))}
      {uitkomst.gaten.map((gat, i) =>
        gat.bladen && (gat.soort === "deur" || gat.soort === "buitendeur") ? <path key={`d${i}`} d={deurpad(gat, k)} className="laag-deurboog" /> : null,
      )}
      {correcties.map((c, i) => {
        const klasse = `laag-correctie ${c.soort}${uitkomst.verslag[i] ? "" : " uit"}`;
        if (c.soort === "muur") return <path key={i} d={pad([strook(c.a, c.b, c.dikte)], k)} className={klasse} />;
        if (c.soort === "weg" || c.soort === "opening" || c.soort === "luifel") {
          const [a, b] = [naarPagina(c.a, k), naarPagina(c.b, k)];
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={klasse} />;
        }
        const [x, y] = naarPagina([c.x, c.y], k);
        return <circle key={i} cx={x} cy={y} r={5 / zoom} className={klasse} />;
      })}
      {begin
        ? (() => {
            const [x, y] = naarPagina(begin.punt, k);
            return <circle cx={x} cy={y} r={5 / zoom} className="laag-begin" />;
          })()
        : null}
    </>
  );

  const uitleg = klein
    ? "Verbeteren gaat op een laptop of tablet; hier kan je enkel kijken."
    : gereedschap === "muur"
      ? begin
        ? "Tik het einde van de nieuwe muur. Ze loopt recht en kleeft aan de as van een muur."
        : "Tik het begin van de nieuwe muur, op haar as. Tegen een bestaande muur kleeft ze aan diens as."
      : gereedschap === "weg"
        ? begin
          ? "Tik waar het stuk eindigt, langs dezelfde muur, of kies Heel dit stuk."
          : "Tik op de muur waar het stuk begint."
        : gereedschap === "opening"
          ? `Tik op de muur waar het midden van de ${GATNAMEN[nieuw.gat].toLowerCase()} komt.`
          : gereedschap === "luifel"
            ? begin
              ? "Tik waar de luifel eindigt, langs dezelfde gevel."
              : "Tik op de gevel waar de luifel begint."
            : "Tik op een raam, deur, doorgang of luifel om ze aan te passen.";

  return (
    <div className="omzetten">
      <div>
        <Planvlak
          blad={blad}
          laag={laag}
          opTik={klein ? undefined : opTik}
          klasse={gereedschap === "kijken" ? undefined : "tikken"}
          start={start}
          info={uitleg}
          label="Het plan met de muren, ramen en deuren"
        />
        <ul className="verbeterlegende" aria-label="Legende">
          <li>
            <span className="legende-kleur muur" /> Muur
          </li>
          {GATSOORTEN.map((soort) => (
            <li key={soort}>
              <span className={`legende-kleur ${soort}`} /> {GATNAMEN[soort]}
            </li>
          ))}
          <li>
            <span className="legende-kleur luifel" /> Luifel
          </li>
          <li>
            <span className="legende-kleur correctie" /> Verbeterd
          </li>
        </ul>
      </div>

      <div className="omzetten-zijbalk">
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}

        {!klein ? (
          <section className="kaart">
            <h3>Verbeteren</h3>
            <div className="knoppenrij">
              {(
                [
                  ["muur", "Muur erbij"],
                  ["weg", "Muur weg"],
                  ["opening", "Raam of deur erbij"],
                  ["luifel", "Luifel erbij"],
                ] as const
              ).map(([welk, tekst]) => (
                <button key={welk} type="button" className={gereedschap === welk ? "" : "stil"} aria-pressed={gereedschap === welk} onClick={() => kies(welk)}>
                  {tekst}
                </button>
              ))}
            </div>
            {gereedschap === "muur" ? (
              <div style={{ marginTop: 10 }}>
                <label htmlFor="muur-dikte">Dikte</label>
                <select id="muur-dikte" value={dikte} onChange={(g) => setDikte(Number(g.currentTarget.value))}>
                  {DIKTES.map((d) => (
                    <option key={d} value={d}>
                      {Math.round(d * 100)} cm
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {gereedschap === "weg" && begin?.plek ? (
              <div className="knoppenrij" style={{ marginTop: 10 }}>
                <button type="button" className="stil" onClick={heelStuk}>
                  Heel dit stuk, tot de volgende muur
                </button>
              </div>
            ) : null}
            {gereedschap === "opening" ? (
              <Openingvelden maat={nieuw} plafond={verdieping.plafond} opWijzig={setNieuw} fout={(tekst) => setMelding({ soort: "fout", tekst })} />
            ) : null}
            {gereedschap === "luifel" ? (
              <Luifelvelden maat={nieuweLuifel} opWijzig={setNieuweLuifel} fout={(tekst) => setMelding({ soort: "fout", tekst })} />
            ) : null}
            {gereedschap !== "kijken" ? (
              <div className="knoppenrij" style={{ marginTop: 10 }}>
                <button type="button" className="stil" onClick={() => kies("kijken")}>
                  Klaar
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {gekozenLuifel && gekozenLuifelVlak && !klein ? (
          <Luifelkaart
            key={`${JSON.stringify(gekozenLuifel)}-${gekozenLuifelVlak.onder}-${gekozenLuifelVlak.dikte}-${gekozenLuifelVlak.diepte}`}
            luifel={gekozenLuifelVlak}
            opToepassen={(maat) => pasLuifelAan(gekozenLuifel, gekozenLuifelVlak, maat)}
            opWeg={() => pasLuifelAan(gekozenLuifel, gekozenLuifelVlak, null)}
            opSluiten={() => setGekozenLuifel(null)}
            fout={(tekst) => setMelding({ soort: "fout", tekst })}
          />
        ) : null}

        {gekozenGat && !klein ? (
          <Gatkaart
            key={`${hartVan(gekozenGat).join(",")}-${gekozenGat.soort}-${breedteVan(gekozenGat)}`}
            gat={gekozenGat}
            plafond={verdieping.plafond}
            opToepassen={(maat) => pasGatAan(gekozenGat, maat)}
            opDraai={(welk) => draaiDeur(gekozenGat, welk)}
            opDicht={() => pasGatAan(gekozenGat, null)}
            opSluiten={() => setGekozen(null)}
            fout={(tekst) => setMelding({ soort: "fout", tekst })}
          />
        ) : null}

        <section className="kaart">
          <h3>Verbeteringen op {verdieping.naam.toLowerCase()}</h3>
          {correcties.length === 0 ? (
            <p className="hulp">Nog niets verbeterd. Het plan toont de muren, ramen en deuren zoals de app ze las.</p>
          ) : (
            <ol className="correcties">
              {correcties.map((c, i) => (
                <li key={i} className={uitkomst.verslag[i] ? undefined : "uit"}>
                  <span>
                    {beschrijving(c)}
                    {uitkomst.verslag[i] ? null : <span className="hulp"> · raakt niets meer: {nietsMeer(c)}</span>}
                  </span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setCorrecties(correcties.filter((_, j) => j !== i));
                      setGekozenLuifel(null);
                    }}
                  >
                    {uitkomst.verslag[i] ? "Ongedaan maken" : "Weghalen"}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {veranderd ? (
            <div className="knoppenrij" style={{ marginTop: 10 }}>
              <button type="button" disabled={bezig || klein} onClick={() => void bewaar()}>
                Bewaren
              </button>
              <button
                type="button"
                className="stil"
                onClick={() => {
                  setCorrecties(bewaard);
                  setBegin(null);
                  setGekozen(null);
                  setGekozenLuifel(null);
                }}
              >
                Herbeginnen
              </button>
            </div>
          ) : null}
          <div className="knoppenrij" style={{ marginTop: 10 }}>
            <a className="knop stil" href={huispad(huisId, "/3d")}>
              Naar 3D
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

/** De soort en de maten van een opening, zoals in de velden. */
function Openingvelden({
  maat,
  plafond,
  opWijzig,
  fout,
}: {
  maat: Openingmaat;
  plafond: number;
  opWijzig: (maat: Openingmaat) => void;
  fout: (tekst: string) => void;
}) {
  const [teksten, setTeksten] = useState({ breedte: komma(maat.breedte), hoogte: komma(maat.hoogte), borstwering: komma(maat.borstwering) });
  const lees = (veld: "breedte" | "hoogte" | "borstwering", tekst: string) => {
    const uit = getal(tekst, veld === "breedte" ? "De breedte" : veld === "hoogte" ? "De hoogte" : "De borstwering");
    if (!uit.ok || uit.waarde === null) return fout(uit.ok ? "Vul een getal in." : uit.melding);
    const nieuw = { ...maat, [veld]: uit.waarde };
    if (nieuw.breedte < 0.3 || nieuw.breedte > 12) return fout("De breedte ligt tussen 0,30 en 12 m.");
    if (nieuw.hoogte < 0.3) return fout("De hoogte is minstens 0,30 m.");
    if ((nieuw.gat === "raam" ? nieuw.borstwering : 0) + nieuw.hoogte > plafond + 0.001) {
      return fout(`De bovenkant komt hoger dan het plafond (${meter(plafond)}).`);
    }
    opWijzig(nieuw);
  };
  const veld = (naam: "breedte" | "hoogte" | "borstwering", label: string) => (
    <div>
      <label htmlFor={`opening-${naam}`}>{label}</label>
      <input
        id={`opening-${naam}`}
        inputMode="decimal"
        value={teksten[naam]}
        onChange={(g) => setTeksten({ ...teksten, [naam]: g.currentTarget.value })}
        onBlur={(g) => lees(naam, g.currentTarget.value)}
        onKeyDown={(g) => {
          if (g.key === "Enter") g.currentTarget.blur();
        }}
      />
    </div>
  );
  return (
    <>
      <div className="veldenrij" style={{ marginTop: 10 }}>
        <div>
          <label htmlFor="opening-soort">Soort</label>
          <select
            id="opening-soort"
            value={maat.gat}
            onChange={(g) => {
              const soort = g.currentTarget.value as Gatsoort;
              const standaard = STANDAARD[soort];
              setTeksten({ breedte: komma(standaard.breedte), hoogte: komma(standaard.hoogte), borstwering: komma(standaard.borstwering) });
              opWijzig(standaard);
            }}
          >
            {GATSOORTEN.map((soort) => (
              <option key={soort} value={soort}>
                {GATNAMEN[soort]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="veldenrij">
        {veld("breedte", "Breedte (m)")}
        {veld("hoogte", "Hoogte (m)")}
        {maat.gat === "raam" ? veld("borstwering", "Borstwering (m)") : null}
      </div>
    </>
  );
}

/** Een gekozen raam, deur of doorgang: een andere soort, andere maten, anders draaien, of dicht. */
function Gatkaart({
  gat,
  plafond,
  opToepassen,
  opDraai,
  opDicht,
  opSluiten,
  fout,
}: {
  gat: Gat;
  plafond: number;
  opToepassen: (maat: Openingmaat) => void;
  opDraai: (welk: keyof Draai) => void;
  opDicht: () => void;
  opSluiten: () => void;
  fout: (tekst: string) => void;
}) {
  const deur = gat.soort === "deur" || gat.soort === "buitendeur";
  const [maat, setMaat] = useState<Openingmaat>({
    gat: gat.soort,
    breedte: Math.round(breedteVan(gat) * 100) / 100,
    hoogte: Math.round((gat.boven - gat.onder) * 100) / 100,
    borstwering: Math.round(gat.onder * 100) / 100,
  });
  return (
    <section className="kaart">
      <h3>
        {GATNAMEN[gat.soort]}, {meter(breedteVan(gat))} breed
      </h3>
      <p className="hulp">
        {hoogtetekst(gat)}.
        {deur ? (gat.bladen ? " Op het plan staat hoe ze draait." : " Op het plan staat geen boog: kies hoe ze draait.") : null}
      </p>
      {deur ? (
        <div className="knoppenrij">
          <button type="button" className="stil" onClick={() => opDraai("scharnier")}>
            Scharnier andere kant
          </button>
          <button type="button" className="stil" onClick={() => opDraai("kant")}>
            Draait naar de andere kant
          </button>
        </div>
      ) : null}
      <Openingvelden maat={maat} plafond={plafond} opWijzig={setMaat} fout={fout} />
      <div className="knoppenrij">
        <button type="button" onClick={() => opToepassen(maat)}>
          Toepassen
        </button>
        <button type="button" className="stil" onClick={opDicht}>
          Dichtmaken
        </button>
        <button type="button" className="stil" onClick={opSluiten}>
          Sluiten
        </button>
      </div>
    </section>
  );
}

type Gelezen = { ok: true; waarde: number | null } | { ok: false; melding: string };

/** Een maat van een luifel uit een veld, of een fout; leeg mag enkel als `leegMag`. */
function luifelgetal(tekst: string, wat: string, min: number, max: number, leegMag = false): Gelezen {
  const uit = getal(tekst, wat);
  if (!uit.ok) return uit;
  if (uit.waarde === null) return leegMag ? uit : { ok: false, melding: `${wat}: vul een getal in.` };
  if (uit.waarde < min || uit.waarde > max) return { ok: false, melding: `${wat} ligt tussen ${komma(min)} en ${komma(max)} m.` };
  return uit;
}

/** De diepte en de dikte van een nieuwe luifel. De onderkant kiest de app; die pas je daarna aan. */
function Luifelvelden({
  maat,
  opWijzig,
  fout,
}: {
  maat: { diepte: number; dikte: number };
  opWijzig: (maat: { diepte: number; dikte: number }) => void;
  fout: (tekst: string) => void;
}) {
  const [teksten, setTeksten] = useState({ diepte: komma(maat.diepte), dikte: komma(maat.dikte) });
  const lees = (veld: "diepte" | "dikte", tekst: string) => {
    const uit = veld === "diepte" ? luifelgetal(tekst, "De diepte", 0.2, 5) : luifelgetal(tekst, "De dikte", 0.05, 1);
    if (!uit.ok) return fout(uit.melding);
    opWijzig({ ...maat, [veld]: uit.waarde });
  };
  const veld = (naam: "diepte" | "dikte", label: string) => (
    <div>
      <label htmlFor={`luifel-${naam}`}>{label}</label>
      <input
        id={`luifel-${naam}`}
        inputMode="decimal"
        value={teksten[naam]}
        onChange={(g) => setTeksten({ ...teksten, [naam]: g.currentTarget.value })}
        onBlur={(g) => lees(naam, g.currentTarget.value)}
        onKeyDown={(g) => {
          if (g.key === "Enter") g.currentTarget.blur();
        }}
      />
    </div>
  );
  return (
    <>
      <div className="veldenrij" style={{ marginTop: 10 }}>
        {veld("diepte", "Diepte (m)")}
        {veld("dikte", "Dikte (m)")}
      </div>
      <p className="hulp">De onderkant kiest de app: tegen de bovenkant van de ramen eronder. Daarna pas je ze aan.</p>
    </>
  );
}

/** Een gekozen luifel: haar maten, of weg. Bij een luifel van het plan ligt de vorm vast; de diepte enkel bij een eigen. */
function Luifelkaart({
  luifel,
  opToepassen,
  opWeg,
  opSluiten,
  fout,
}: {
  luifel: Toegepasteluifel;
  opToepassen: (maat: Luifelmaat) => void;
  opWeg: () => void;
  opSluiten: () => void;
  fout: (tekst: string) => void;
}) {
  const eigen = luifel.bron === "zelf";
  const [teksten, setTeksten] = useState({
    diepte: komma(luifel.diepte),
    onder: luifel.vanzelf ? "" : komma(luifel.onder),
    dikte: komma(luifel.dikte),
  });
  function toepassen() {
    // De diepte telt enkel bij een eigen luifel: die van het plan ligt vast.
    const diepte: Gelezen = eigen ? luifelgetal(teksten.diepte, "De diepte", 0.2, 5) : { ok: true, waarde: luifel.diepte };
    const onder = luifelgetal(teksten.onder, "De onderkant", 0, 6, true);
    const dikte = luifelgetal(teksten.dikte, "De dikte", 0.05, 1);
    for (const uit of [diepte, onder, dikte]) if (!uit.ok) return fout(uit.melding);
    if (!diepte.ok || !onder.ok || !dikte.ok) return;
    opToepassen({ diepte: diepte.waarde ?? luifel.diepte, onder: onder.waarde, dikte: dikte.waarde ?? luifel.dikte });
  }
  const veld = (naam: "diepte" | "onder" | "dikte", label: string, placeholder?: string) => (
    <div>
      <label htmlFor={`luifelkaart-${naam}`}>{label}</label>
      <input
        id={`luifelkaart-${naam}`}
        inputMode="decimal"
        value={teksten[naam]}
        placeholder={placeholder}
        onChange={(g) => setTeksten({ ...teksten, [naam]: g.currentTarget.value })}
        onKeyDown={(g) => {
          if (g.key === "Enter") toepassen();
        }}
      />
    </div>
  );
  return (
    <section className="kaart">
      <h3>
        {eigen ? "Luifel die je zette" : "Luifel van het plan"}, {meter(luifel.diepte)} diep
      </h3>
      <p className="hulp">
        Van {meter(luifel.onder)} tot {meter(luifel.onder + luifel.dikte)} boven de vloer.
        {luifel.vanzelf ? " De onderkant koos de app: tegen de bovenkant van de ramen eronder." : null}
      </p>
      <div className="veldenrij">
        {eigen ? veld("diepte", "Diepte (m)") : null}
        {veld("onder", "Onderkant (m)", `${komma(luifel.onder)}, vanzelf`)}
        {veld("dikte", "Dikte (m)")}
      </div>
      <p className="hulp">Laat de onderkant leeg, dan kiest de app ze.</p>
      <div className="knoppenrij">
        <button type="button" onClick={toepassen}>
          Toepassen
        </button>
        <button type="button" className="stil" onClick={opWeg}>
          Weg
        </button>
        <button type="button" className="stil" onClick={opSluiten}>
          Sluiten
        </button>
      </div>
    </section>
  );
}
