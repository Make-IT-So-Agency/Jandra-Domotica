"use client";

import { useEffect, useMemo, useState } from "react";

import type { Punt as Schermpunt } from "@/lib/bouw/beeld";
import {
  BIJ_OPENING,
  DIKTES,
  GATNAMEN,
  GATSOORTEN,
  eindeOpMuur,
  opAs,
  opMuur,
  pasCorrectiesToe,
  rechtGezet,
  strook,
  stukVanMuur,
  vlakVanGat,
  type Correctie,
  type Muurplek,
} from "@/lib/bouw/drie/correcties";
import { hartVan, type Gat, type Gatsoort, type Gekendeopening } from "@/lib/bouw/drie/gaten";
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
  correcties: Correctie[];
}

type Gereedschap = "kijken" | "muur" | "weg" | "opening";

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

const hoogtetekst = (c: { onder: number; boven: number }) => (c.onder > 0.005 ? `van ${meter(c.onder)} tot ${meter(c.boven)}` : `${meter(c.boven)} hoog`);

/** Een correctie in woorden, voor de lijst. */
function beschrijving(c: Correctie): string {
  switch (c.soort) {
    case "muur":
      return `Muur erbij, ${meter(afstand(c.a, c.b))} lang en ${Math.round(c.dikte * 100)} cm dik`;
    case "weg":
      return `Muur weg over ${meter(afstand(c.a, c.b))}`;
    case "opening":
      return `${GATNAMEN[c.gat]} erbij, ${meter(afstand(c.a, c.b))} breed, ${hoogtetekst(c)}`;
    case "gat":
      return `Opening wordt ${GATNAMEN[c.gat].toLowerCase()}${c.breedte !== undefined ? ` van ${meter(c.breedte)} breed` : ""}, ${hoogtetekst(c)}`;
    case "dicht":
      return "Opening dicht";
  }
}

/**
 * Muren, ramen en deuren verbeteren op het plan: tik, en het plan toont
 * meteen wat 3D bouwt. Alles samen bewaren. Op een laptop of tablet; op een
 * gsm enkel bekijken.
 */
export default function Verbeterplan({ huisId, gegevens }: { huisId: number; gegevens: Verbetergegevens }) {
  const { verdieping, versie, ruimtes, muren, openingen } = gegevens;
  const k = versie.kalibratie;
  const { blad, fout } = usePlanblad(huisId, versie.id, versie.bestandId, versie.pagina);

  const [klein, setKlein] = useState(false);
  const [bewaard, setBewaard] = useState<Correctie[]>(gegevens.correcties);
  const [correcties, setCorrecties] = useState<Correctie[]>(gegevens.correcties);
  const [gereedschap, setGereedschap] = useState<Gereedschap>("kijken");
  const [begin, setBegin] = useState<{ punt: Xy; plek: Muurplek | null } | null>(null);
  const [dikte, setDikte] = useState<number>(0.14);
  const [nieuw, setNieuw] = useState<Openingmaat>(STANDAARD.raam);
  const [gekozen, setGekozen] = useState<Xy | null>(null);
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
    () => pasCorrectiesToe(omgezet, ruimtes, openingen, verdieping.plafond, correcties),
    [omgezet, ruimtes, openingen, verdieping.plafond, correcties],
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

    // Kijken: een raam, deur of doorgang kiezen om aan te passen.
    const geraakt =
      uitkomst.gaten.find((gat) => binnenVeelhoeken(p, [vlakVanGat(gat)])) ??
      [...uitkomst.gaten].sort((a, b) => afstand(hartVan(a), p) - afstand(hartVan(b), p)).find((gat) => afstand(hartVan(gat), p) <= bereik + gat.dikte);
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
      };
      setCorrecties(correcties.map((c, i) => (i === eigen ? vervanging : c)));
      return;
    }
    const breder = Math.abs(maat.breedte - breedteVan(gat)) > 0.01 ? { breedte: mm(maat.breedte) } : {};
    setCorrecties([...zonder, { soort: "gat", x: mm(hart[0]), y: mm(hart[1]), ...hoogtes, ...breder }]);
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
      <path d={pad(uitkomst.muren, k)} fillRule="evenodd" className="laag-muur" />
      {uitkomst.open.length > 0 ? <path d={pad(uitkomst.open, k)} fillRule="evenodd" className="laag-muurweg" /> : null}
      {uitkomst.gaten.map((gat, i) => (
        <path key={i} d={pad([vlakVanGat(gat)], k)} className={`laag-gat ${gat.soort}${gat === gekozenGat ? " gekozen" : ""}`} />
      ))}
      {correcties.map((c, i) => {
        const klasse = `laag-correctie ${c.soort}${uitkomst.verslag[i] ? "" : " uit"}`;
        if (c.soort === "muur") return <path key={i} d={pad([strook(c.a, c.b, c.dikte)], k)} className={klasse} />;
        if (c.soort === "weg" || c.soort === "opening") {
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
          : "Tik op een raam, deur of doorgang om ze aan te passen.";

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
            {gereedschap !== "kijken" ? (
              <div className="knoppenrij" style={{ marginTop: 10 }}>
                <button type="button" className="stil" onClick={() => kies("kijken")}>
                  Klaar
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {gekozenGat && !klein ? (
          <Gatkaart
            key={`${hartVan(gekozenGat).join(",")}-${gekozenGat.soort}-${breedteVan(gekozenGat)}`}
            gat={gekozenGat}
            plafond={verdieping.plafond}
            opToepassen={(maat) => pasGatAan(gekozenGat, maat)}
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
                    {uitkomst.verslag[i] ? null : <span className="hulp"> · raakt niets meer: hier ligt geen muur of opening meer</span>}
                  </span>
                  <button type="button" className="link" onClick={() => setCorrecties(correcties.filter((_, j) => j !== i))}>
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

/** Een gekozen raam, deur of doorgang: een andere soort, andere maten, of dicht. */
function Gatkaart({
  gat,
  plafond,
  opToepassen,
  opDicht,
  opSluiten,
  fout,
}: {
  gat: Gat;
  plafond: number;
  opToepassen: (maat: Openingmaat) => void;
  opDicht: () => void;
  opSluiten: () => void;
  fout: (tekst: string) => void;
}) {
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
      <p className="hulp">{hoogtetekst(gat)}.</p>
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
