"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Punt } from "@/lib/bouw/beeld";
import { getal } from "@/lib/bouw/invoer";
import type { Bevestigkalibratie } from "@/lib/bouw/omzetting/bevestigen";
import {
  binnen,
  binnenRuimte,
  draai,
  middenVan,
  naarHuis,
  naarPagina,
  nettoOppervlakte,
  splits,
  type Kalibratie,
} from "@/lib/bouw/omzetting/geometrie";
import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import { zetOm } from "@/lib/bouw/omzetting/pijplijn";
import { ZEKER_UITGELIJND, beoordeelRuimte } from "@/lib/bouw/omzetting/reeks";
import type { Referentie } from "@/lib/bouw/omzetting/referentie";
import { vergelijkRuimtes, type Oudruimte } from "@/lib/bouw/omzetting/ruimtediff";
import { bewijs } from "@/lib/bouw/omzetting/schaal";
import { raadSoort } from "@/lib/bouw/omzetting/soorten";
import { trapdraai } from "@/lib/bouw/omzetting/trappen";
import type { Blad, Kandidaat, Opening, Ruimtevoorstel, Voorstel, Xy } from "@/lib/bouw/omzetting/types";
import { lijnUitOpLijnen, lijnUitOpNamen, muurlijnen, type Lijnstuk } from "@/lib/bouw/omzetting/uitlijnen";
import { huispad } from "@/lib/bouw/paden";
import { pdfFout } from "@/lib/bouw/pdf";
import { RUIMTENAMEN, SOORTEN_RUIMTE, isSoortRuimte } from "@/lib/bouw/types";

import { leesReferentie } from "../../omzetting-lezen";
import { usePlanblad } from "../planblad";
import { Planvlak } from "../planvlak";
import { bevestigOmzettingActie } from "./acties";

export interface Omzetgegevens {
  huisId: number;
  planId: number;
  versie: { id: number; label: string; bestandId: number; pagina: number; kalibratie: Kalibratie | null };
  verdieping: { id: number; naam: string; vloerpeil_m: number | null; plafondhoogte_m: number | null };
  /** De ruimtes die de verdieping nu heeft, in meter. */
  bestaand: Oudruimte[];
  bevestigd: boolean;
  referentie: Referentie | null;
}

interface Bewerkruimte extends Ruimtevoorstel {
  /** De naam zoals op het plan van de architect. */
  naamPlan: string;
  /** Koos iemand de soort zelf? Dan raadt een nieuwe naam ze niet meer. */
  soortGekozen: boolean;
}

type Modus =
  | { soort: "kiezen" }
  | { soort: "toevoegen" }
  | { soort: "splitsen"; sleutel: string; punten: Xy[] }
  | { soort: "schaal"; punten: Xy[] }
  | { soort: "punt"; eerste: Xy | null };

interface Verschuiving {
  kwartslagen: number;
  dx: number;
  dy: number;
}

const m2 = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m²`;

/**
 * Waar de tekening op dit blad staat tegenover het blad van de referentie,
 * in mensentaal. De verschuiving in het huis is het omgekeerde: wat op het
 * blad meer naar rechts staat, schuift in het huis naar links.
 */
function plaatsOpBlad(verschuiving: { dx: number; dy: number }, referentie: { dx: number; dy: number }, kort = false): string {
  const x = Math.round(-(verschuiving.dx - referentie.dx) * 100);
  const y = Math.round(-(verschuiving.dy - referentie.dy) * 100);
  if (x === 0 && y === 0) return kort ? "zelfde plaats" : "op dezelfde plaats als op het blad van de referentie";
  const delen = [
    x !== 0 ? `${Math.abs(x)} cm ${kort ? (x > 0 ? "rechts" : "links") : x > 0 ? "meer naar rechts" : "meer naar links"}` : null,
    y !== 0 ? `${Math.abs(y)} cm ${y > 0 ? "lager" : "hoger"}` : null,
  ].filter(Boolean);
  return kort ? delen.join(", ") : `${delen.join(" en ")} dan op het blad van de referentie`;
}
const komma = (waarde: number | null) => (waarde === null ? "" : String(waarde).replace(".", ","));

/** Een SVG-pad voor een ruimte: de buitenrand en de gaten, met evenodd. */
function pad(ringen: Xy[][]): string {
  return ringen.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`).join("");
}

/**
 * Het nakijkscherm van een omzetting: het plan met de ruimtes erover, en
 * rechts de stappen. Op een laptop of tablet; op een gsm is het te klein om
 * ruimtes aan te tikken.
 */
export default function Nakijken({ gegevens }: { gegevens: Omzetgegevens }) {
  const { huisId, versie, verdieping, bestaand, referentie } = gegevens;
  const router = useRouter();
  const { blad, fout: bladfout } = usePlanblad(huisId, versie.id, versie.bestandId, versie.pagina);

  const [klein, setKlein] = useState(false);
  const [gelezen, setGelezen] = useState<Blad | null>(null);
  const [handschaal, setHandschaal] = useState<number | null>(null);
  const [voorstel, setVoorstel] = useState<Voorstel | null>(null);
  const [ruimtes, setRuimtes] = useState<Bewerkruimte[]>([]);
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([]);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>({ soort: "kiezen" });
  const [afstand, setAfstand] = useState("");
  const [referentielijnen, setReferentielijnen] = useState<Lijnstuk[] | null>(null);
  const [verschuiving, setVerschuiving] = useState<Verschuiving | null>(
    versie.kalibratie ? { kwartslagen: versie.kalibratie.kwartslagen, dx: versie.kalibratie.dx, dy: versie.kalibratie.dy } : null,
  );
  const [uitlijnen, setUitlijnen] = useState<{ bezig: boolean; zekerheid: number | null; alternatieven: { dx: number; dy: number }[] }>({
    bezig: false,
    zekerheid: null,
    alternatieven: [],
  });
  const [toonReferentie, setToonReferentie] = useState(true);
  const [stap, setStap] = useState(0.01);
  const [verdiepingBijwerken, setVerdiepingBijwerken] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "fout" | "info"; tekst: string } | null>(null);

  useEffect(() => {
    const vraag = window.matchMedia("(max-width: 599px)");
    const zet = () => setKlein(vraag.matches);
    zet();
    vraag.addEventListener("change", zet);
    return () => vraag.removeEventListener("change", zet);
  }, []);

  // 1. Het blad lezen, één keer.
  useEffect(() => {
    if (!blad) return;
    let weg = false;
    leesBlad(blad.pagina).then(
      (resultaat) => {
        if (!weg) setGelezen(resultaat);
      },
      (oorzaak) => {
        if (!weg) setMelding({ soort: "fout", tekst: pdfFout(oorzaak) });
      },
    );
    return () => {
      weg = true;
    };
  }, [blad]);

  // 2. Omzetten, en opnieuw als iemand de schaal zelf aanduidt.
  useEffect(() => {
    if (!gelezen) return;
    const nieuw = zetOm(gelezen, handschaal ? { meterPerPunt: handschaal } : {});
    setVoorstel(nieuw);
    setRuimtes(nieuw.ruimtes.map((ruimte) => ({ ...ruimte, naamPlan: ruimte.naam, soortGekozen: false })));
    setKandidaten(nieuw.kandidaten);
    setGekozen(null);
  }, [gelezen, handschaal]);

  // 3. Het blad om op uit te lijnen.
  useEffect(() => {
    if (!referentie) return;
    let weg = false;
    leesReferentie(huisId, referentie).then(
      (lijnen) => {
        if (!weg) setReferentielijnen(lijnen);
      },
      () => {
        if (!weg) setReferentielijnen([]);
      },
    );
    return () => {
      weg = true;
    };
  }, [huisId, referentie]);

  const meterPerPunt = voorstel?.schaal?.meterPerPunt ?? null;

  /** Zoekt de verschuiving voor een gegeven aantal kwartslagen. */
  const lijnUit = useCallback(
    (kwartslagen: number) => {
      if (!gelezen || !voorstel || !meterPerPunt || !referentie || !referentielijnen) return;
      setUitlijnen((huidig) => ({ ...huidig, bezig: true }));
      // Even wachten, zodat "Uitlijnen…" eerst op het scherm staat.
      window.setTimeout(() => {
        const ruimtesInPunten = voorstel.ruimtes.map((r) => ({ naam: r.naam, ringen: r.ringen }));
        const opNamen =
          referentie.soort === "versie" ? lijnUitOpNamen(ruimtesInPunten, bestaand, meterPerPunt, kwartslagen) : null;
        const zelfdePlaats = { dx: referentie.kalibratie.dx, dy: referentie.kalibratie.dy };
        const opLijnen = lijnUitOpLijnen(muurlijnen(gelezen, meterPerPunt, voorstel.gebied), meterPerPunt, referentielijnen, {
          begin: opNamen ?? (kwartslagen === referentie.kalibratie.kwartslagen ? zelfdePlaats : undefined),
          kwartslagen: [kwartslagen],
          bereikM: opNamen ? 0.6 : 3,
        });
        const gevonden = opLijnen ?? opNamen;
        setVerschuiving(gevonden ? { kwartslagen, dx: gevonden.dx, dy: gevonden.dy } : { kwartslagen, ...zelfdePlaats });
        setUitlijnen({ bezig: false, zekerheid: gevonden?.zekerheid ?? null, alternatieven: gevonden?.alternatieven ?? [] });
        setToonReferentie(true);
      }, 30);
    },
    [gelezen, voorstel, meterPerPunt, referentie, referentielijnen, bestaand],
  );

  // 4. Uitlijnen zodra alles er is, tenzij er al een bevestigde uitlijning is.
  useEffect(() => {
    if (verschuiving || !referentielijnen || !voorstel?.schaal) return;
    lijnUit(referentie?.kalibratie.kwartslagen ?? 0);
  }, [verschuiving, referentielijnen, voorstel, lijnUit, referentie]);

  const kalibratie = useMemo<Kalibratie | null>(
    () =>
      meterPerPunt
        ? {
            meterPerPunt,
            kwartslagen: verschuiving?.kwartslagen ?? 0,
            dx: verschuiving?.dx ?? 0,
            dy: verschuiving?.dy ?? 0,
          }
        : null,
    [meterPerPunt, verschuiving],
  );
  const wachtOpUitlijning = referentie !== null && verschuiving === null;

  // 5. Een ruimte die op dezelfde plaats lag, houdt de naam die ze al had.
  const [namenOvergenomen, setNamenOvergenomen] = useState(false);
  useEffect(() => {
    if (namenOvergenomen || !kalibratie || wachtOpUitlijning || bestaand.length === 0 || ruimtes.length === 0) return;
    const verschil = vergelijkRuimtes(
      bestaand,
      ruimtes.map((r) => ({ sleutel: r.sleutel, naam: r.naam, ringen: r.ringen.map((ring) => ring.map((p) => naarHuis(p, kalibratie))) })),
    );
    setRuimtes((huidig) =>
      huidig.map((r) => {
        const koppeling = verschil.koppelingen.find((k) => k.sleutel === r.sleutel);
        return koppeling?.oudeNaam && koppeling.oudeNaam !== r.naam ? beoordeelRuimte({ ...r, naam: koppeling.oudeNaam }) : r;
      }),
    );
    setNamenOvergenomen(true);
  }, [namenOvergenomen, kalibratie, wachtOpUitlijning, bestaand, ruimtes]);

  const verschil = useMemo(() => {
    if (!kalibratie) return null;
    return vergelijkRuimtes(
      bestaand,
      ruimtes
        .filter((r) => r.mee)
        .map((r) => ({ sleutel: r.sleutel, naam: r.naam, ringen: r.ringen.map((ring) => ring.map((p) => naarHuis(p, kalibratie))) })),
    );
  }, [bestaand, ruimtes, kalibratie]);

  const wijzig = (sleutel: string, velden: Partial<Bewerkruimte>) =>
    setRuimtes((huidig) => huidig.map((r) => (r.sleutel === sleutel ? beoordeelRuimte({ ...r, ...velden }) : r)));

  const hernoem = (sleutel: string, naam: string) =>
    setRuimtes((huidig) =>
      huidig.map((r) =>
        r.sleutel === sleutel ? beoordeelRuimte({ ...r, naam, soort: r.soortGekozen ? r.soort : raadSoort(naam) }) : r,
      ),
    );

  const opTik = (punt: Punt) => {
    const p: Xy = [punt.x, punt.y];
    setMelding(null);
    switch (modus.soort) {
      case "kiezen": {
        const geraakt = [...ruimtes].reverse().find((r) => binnenRuimte(p, r.ringen));
        setGekozen(geraakt?.sleutel ?? null);
        if (geraakt) document.getElementById(`ruimte-${geraakt.sleutel}`)?.scrollIntoView({ block: "nearest" });
        break;
      }
      case "toevoegen": {
        const kandidaat = kandidaten.find((k) => binnen(p, k.ring));
        if (!kandidaat || !meterPerPunt) {
          setMelding({ soort: "info", tekst: "Tik in een gestippeld vlak." });
          break;
        }
        const nieuw = beoordeelRuimte({
          sleutel: `n-${kandidaat.sleutel}`,
          naam: "",
          naamPlan: "",
          soort: "andere",
          soortGekozen: false,
          ringen: [kandidaat.ring],
          oppervlakte: kandidaat.oppervlakte,
          oppervlaktePlan: null,
          plafondhoogte: kandidaat.plafondhoogte,
          vloerpeil: kandidaat.vloerpeil,
          status: "nakijken",
          redenen: [],
          mee: true,
          ruimteId: null,
        });
        setRuimtes((huidig) => [...huidig, nieuw]);
        setKandidaten((huidig) => huidig.filter((k) => k.sleutel !== kandidaat.sleutel));
        setGekozen(nieuw.sleutel);
        setModus({ soort: "kiezen" });
        break;
      }
      case "splitsen": {
        const punten = [...modus.punten, p];
        if (punten.length < 2) {
          setModus({ ...modus, punten });
          break;
        }
        const ruimte = ruimtes.find((r) => r.sleutel === modus.sleutel);
        const delen = ruimte ? splits(ruimte.ringen, punten[0], punten[1]) : null;
        setModus({ soort: "kiezen" });
        if (!ruimte || !delen || !meterPerPunt) {
          setMelding({ soort: "fout", tekst: "De lijn moet de ruimte in twee snijden. Probeer opnieuw." });
          break;
        }
        const opp = (ringen: Xy[][]) => Math.round(nettoOppervlakte(ringen) * meterPerPunt * meterPerPunt * 100) / 100;
        const [groot, klein2] = [...delen].sort((a, b) => opp(b) - opp(a));
        const tweede = `${ruimte.sleutel}-${Date.now().toString(36)}`;
        setRuimtes((huidig) =>
          huidig.flatMap((r) =>
            r.sleutel !== ruimte.sleutel
              ? [r]
              : [
                  beoordeelRuimte({ ...r, ringen: groot, oppervlakte: opp(groot), oppervlaktePlan: null }),
                  beoordeelRuimte({
                    ...r,
                    sleutel: tweede,
                    naam: "",
                    naamPlan: "",
                    soort: "andere",
                    soortGekozen: false,
                    ringen: klein2,
                    oppervlakte: opp(klein2),
                    oppervlaktePlan: null,
                    ruimteId: null,
                  }),
                ],
          ),
        );
        setGekozen(tweede);
        break;
      }
      case "schaal": {
        const punten = [...modus.punten, p].slice(-2);
        setModus({ soort: "schaal", punten });
        break;
      }
      case "punt": {
        if (!modus.eerste) {
          setModus({ soort: "punt", eerste: p });
          break;
        }
        if (kalibratie && verschuiving) {
          // Het punt van de blauwe tekening moet op het punt van het plan komen.
          const [ex, ey] = draai(
            [(modus.eerste[0] - p[0]) * kalibratie.meterPerPunt, (modus.eerste[1] - p[1]) * kalibratie.meterPerPunt],
            kalibratie.kwartslagen,
          );
          setVerschuiving({ ...verschuiving, dx: verschuiving.dx + ex, dy: verschuiving.dy + ey });
        }
        setModus({ soort: "kiezen" });
        break;
      }
    }
  };

  /** Schuift de blauwe tekening op het scherm, in meter. */
  const schuif = (rechts: number, omlaag: number) => {
    if (!verschuiving) return;
    const [ex, ey] = draai([-rechts, -omlaag], verschuiving.kwartslagen);
    setVerschuiving({ ...verschuiving, dx: Math.round((verschuiving.dx + ex) * 1000) / 1000, dy: Math.round((verschuiving.dy + ey) * 1000) / 1000 });
  };

  async function bevestig() {
    if (!voorstel?.schaal || !kalibratie || !verschil) return;
    const mee = ruimtes.filter((r) => r.mee);
    if (mee.length === 0) return setMelding({ soort: "fout", tekst: "Vink minstens één ruimte aan." });
    if (mee.some((r) => !r.naam.trim())) return setMelding({ soort: "fout", tekst: "Geef elke ruimte die meegaat een naam." });
    if (verschil.verdwenen.length > 0) {
      const namen = verschil.verdwenen.map((r) => r.naam).join(", ");
      if (!window.confirm(`Deze ruimtes verdwijnen van ${verdieping.naam}: ${namen}. Verder?`)) return;
    }

    const volledig: Bevestigkalibratie = {
      ...kalibratie,
      bron: voorstel.schaal.bron,
      bewijs: bewijs(voorstel.schaal),
      referentieVersieId: referentie?.versieId ?? null,
    };
    setBezig(true);
    setMelding({ soort: "info", tekst: "Bewaren…" });
    const uitkomst = await bevestigOmzettingActie(huisId, {
      versieId: versie.id,
      kalibratie: volledig,
      ruimtes: mee.map((r) => ({
        ruimteId: verschil.koppelingen.find((k) => k.sleutel === r.sleutel)?.ruimteId ?? null,
        naam: r.naam.trim(),
        soort: r.soort,
        ringen: r.ringen,
        oppervlaktePlan: r.oppervlaktePlan,
        plafondhoogte: r.plafondhoogte,
        vloerpeil: r.vloerpeil,
      })),
      openingen: voorstel.openingen,
      muren: voorstel.muren,
      trappen: voorstel.trappen,
      luifels: voorstel.luifels.map(({ lijn, diepte }) => ({ lijn, diepte })),
      verdieping: {
        bijwerken: verdiepingBijwerken,
        vloerpeil: voorstel.verdieping.vloerpeil,
        plafondhoogte: voorstel.verdieping.plafondhoogte,
      },
      schaal: voorstel.schaal,
    }).catch(() => null);
    setBezig(false);
    if (!uitkomst) return setMelding({ soort: "fout", tekst: "Geen verbinding met de app. Probeer opnieuw." });
    if (!uitkomst.ok) return setMelding({ soort: "fout", tekst: uitkomst.melding });
    const { bijgewerkt, nieuw, verwijderd } = uitkomst.data;
    const tekst = `${verdieping.naam}: ${bijgewerkt + nieuw} ruimtes bevestigd${verwijderd > 0 ? `, ${verwijderd} verwijderd` : ""}.`;
    router.push(huispad(huisId, `/ruimtes?soort=goed&melding=${encodeURIComponent(tekst)}#verdieping-${uitkomst.data.verdiepingId}`));
    router.refresh();
  }

  if (klein) {
    return (
      <div className="melding let-op">
        Omzetten en nakijken gaat op een laptop of tablet: op een gsm zijn de ruimtes te klein om aan te tikken.
        De bevestigde ruimtes bekijk je wel op de gsm, bij Ruimtes.
      </div>
    );
  }
  if (bladfout) return <div className="melding fout">{bladfout}</div>;
  if (!blad || !gelezen || !voorstel) {
    return (
      <div className="viewer">
        <div className="viewer-leeg">{blad ? "Het plan lezen…" : "Plan laden…"}</div>
      </div>
    );
  }

  const gekozenRuimte = ruimtes.find((r) => r.sleutel === gekozen) ?? null;
  const mee = ruimtes.filter((r) => r.mee);
  const totaal = mee.reduce((som, r) => som + r.oppervlakte, 0);
  const tikt = modus.soort !== "kiezen";
  const s = voorstel.schaal;

  const laag = (zoom: number) => (
    <>
      {voorstel.muren.length > 0 ? <path className="laag-muur" d={pad(voorstel.muren)} /> : null}
      {voorstel.trappen.flatMap((trap, i) =>
        trap.delen.map((deel, j) => {
          const [a, b, c, d] = deel.hoeken;
          if (deel.soort === "bordes") return <path key={`${i}-${j}`} d={pad([deel.hoeken])} className="laag-trap" />;
          // Een vlucht met een pijl naar boven: van het midden van de onderste rand naar dat van de bovenste.
          const onder: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const boven: Xy = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
          const lengte = Math.hypot(boven[0] - onder[0], boven[1] - onder[1]) || 1;
          const r: Xy = [(boven[0] - onder[0]) / lengte, (boven[1] - onder[1]) / lengte];
          const punt = 8 / zoom;
          return (
            <g key={`${i}-${j}`}>
              <path d={pad([deel.hoeken])} className="laag-trap" />
              <path
                d={`M${onder[0]},${onder[1]}L${boven[0]},${boven[1]}M${boven[0] - r[0] * punt - r[1] * punt * 0.6},${boven[1] - r[1] * punt + r[0] * punt * 0.6}L${boven[0]},${boven[1]}L${boven[0] - r[0] * punt + r[1] * punt * 0.6},${boven[1] - r[1] * punt - r[0] * punt * 0.6}`}
                className="laag-traplijn"
              />
            </g>
          );
        }),
      )}
      {ruimtes.map((r) => (
        <path
          key={r.sleutel}
          d={pad(r.ringen)}
          fillRule="evenodd"
          className={`laag-ruimte ${r.mee ? r.status : "uit"}${r.sleutel === gekozen ? " gekozen" : ""}`}
        />
      ))}
      {modus.soort === "toevoegen"
        ? kandidaten.map((k) => <path key={k.sleutel} d={pad([k.ring])} className="laag-kandidaat" />)
        : null}
      {referentie && referentielijnen && kalibratie && verschuiving && toonReferentie ? (
        <path
          className="laag-referentie"
          d={referentielijnen
            .map(([a, b]) => {
              const [ax, ay] = naarPagina(a, kalibratie);
              const [bx, by] = naarPagina(b, kalibratie);
              return `M${ax.toFixed(1)},${ay.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}`;
            })
            .join("")}
        />
      ) : null}
      {voorstel.openingen.map((o: Opening, i) => (
        <circle key={i} cx={o.x} cy={o.y} r={4 / zoom} className={o.soort === "deur" ? "laag-deur" : "laag-raam"} />
      ))}
      {ruimtes.map((r) => {
        // De architect zet de naam en de oppervlakte al op het plan. Enkel wat
        // daar niet staat, komt erbij: de gekozen ruimte, een andere naam, of
        // wat na te kijken is.
        const toon = r.sleutel === gekozen || r.naam !== r.naamPlan || r.status !== "goed";
        if (!toon) return null;
        const [x, y] = middenVan(r.ringen);
        const grootte = 12 / zoom;
        return (
          <text key={r.sleutel} x={x} y={y} fontSize={grootte} strokeWidth={3 / zoom} className="laag-naam">
            <tspan x={x}>{r.naam || "?"}</tspan>
            <tspan x={x} dy={grootte * 1.2} fontWeight={400}>
              {m2(r.oppervlakte)}
            </tspan>
          </text>
        );
      })}
      {(modus.soort === "splitsen" || modus.soort === "schaal") && modus.punten.length > 0 ? (
        <>
          {modus.punten.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={5 / zoom} className="laag-punt" />
          ))}
          {modus.punten.length === 2 ? (
            <line x1={modus.punten[0][0]} y1={modus.punten[0][1]} x2={modus.punten[1][0]} y2={modus.punten[1][1]} className="laag-lijn" />
          ) : null}
        </>
      ) : null}
      {modus.soort === "punt" && modus.eerste ? (
        <circle cx={modus.eerste[0]} cy={modus.eerste[1]} r={5 / zoom} className="laag-punt" />
      ) : null}
    </>
  );

  const uitleg: Record<Modus["soort"], string> = {
    kiezen: "Tik op een ruimte om ze te kiezen.",
    toevoegen: "Tik in een gestippeld vlak om het als ruimte toe te voegen.",
    splitsen: "Tik twee punten: de lijn ertussen splitst de ruimte.",
    schaal: "Tik de twee uiteinden van een maat waarvan je de echte lengte kent.",
    punt: modus.soort === "punt" && modus.eerste ? "Tik nu hetzelfde punt op het plan." : "Tik een hoek van de blauwe tekening.",
  };

  return (
    <div className="omzetten">
      <div>
        <Planvlak
          blad={blad}
          laag={laag}
          opTik={opTik}
          klasse={tikt ? "tikken" : undefined}
          start={
            voorstel.gebied
              ? {
                  x: voorstel.gebied.x0,
                  y: voorstel.gebied.y0,
                  breedte: voorstel.gebied.x1 - voorstel.gebied.x0,
                  hoogte: voorstel.gebied.y1 - voorstel.gebied.y0,
                }
              : null
          }
          info={uitleg[modus.soort]}
          label="Het plan met de ruimtes: tik op een ruimte om ze te kiezen"
        />
      </div>

      <div className="omzetten-zijbalk">
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}
        {voorstel.meldingen.length > 0 ? (
          <div className="melding let-op">
            {voorstel.meldingen.map((tekst) => (
              <p key={tekst}>{tekst}</p>
            ))}
          </div>
        ) : null}

        <section className="kaart">
          <h3>Schaal</h3>
          {s ? <p className={s.zeker ? "status-goed" : "status-nakijken"}>{s.zeker ? "✔ " : "⚠ "}{bewijs(s)}</p> : null}
          {modus.soort === "schaal" ? (
            <>
              <p className="hulp">{uitleg.schaal}</p>
              {modus.punten.length === 2 ? (
                <div className="veldenrij">
                  <div>
                    <label htmlFor="afstand">Echte lengte (m)</label>
                    <input id="afstand" inputMode="decimal" value={afstand} onChange={(g) => setAfstand(g.currentTarget.value)} />
                  </div>
                </div>
              ) : null}
              <div className="knoppenrij">
                <button
                  type="button"
                  disabled={modus.punten.length < 2}
                  onClick={() => {
                    const lengte = getal(afstand, "De lengte");
                    const [a, b] = modus.punten;
                    const punten = Math.hypot(b[0] - a[0], b[1] - a[1]);
                    if (!lengte.ok || !lengte.waarde || lengte.waarde <= 0 || punten < 1) {
                      return setMelding({ soort: "fout", tekst: "Tik twee punten en geef hun echte afstand in meter." });
                    }
                    setHandschaal(lengte.waarde / punten);
                    setNamenOvergenomen(false);
                    setModus({ soort: "kiezen" });
                  }}
                >
                  Schaal toepassen
                </button>
                <button type="button" className="stil" onClick={() => setModus({ soort: "kiezen" })}>
                  Annuleren
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="stil" onClick={() => setModus({ soort: "schaal", punten: [] })}>
              Schaal zelf aanduiden
            </button>
          )}
        </section>

        {voorstel.trappen.length > 0 ? (
          <section className="kaart">
            <h3>{voorstel.trappen.length === 1 ? "Trap" : "Trappen"}</h3>
            {voorstel.trappen.map((trap, i) => {
              const treden = trap.delen.reduce((som, deel) => som + deel.treden, 0);
              const vorm = trap.delen.length === 1 ? "recht" : trapdraai(trap) === 180 ? "draait halfweg 180°, met een bordes" : "draait een kwartslag, met een bordes";
              return (
                <p key={i} className={trap.richting === "pijl" ? "status-goed" : "status-nakijken"}>
                  {trap.richting === "pijl" ? "✔ " : "⚠ "}
                  {`Gevonden: ${vorm}, ${treden} treden. `}
                  <span className="hulp">
                    {trap.richting === "pijl" ? "Naar boven volgens de pijl op het plan." : "Geen pijl op het plan: de richting kies je in 3D."}
                  </span>
                </p>
              );
            })}
          </section>
        ) : null}

        {referentie ? (
          <section className="kaart">
            <h3>Uitlijnen</h3>
            <p className="hulp">
              Op {referentie.soort === "versie" ? "de vorige versie" : referentie.verdieping.toLowerCase()} ({referentie.planTitel},{" "}
              {referentie.label}). Die ligt er in het blauw over: de muren moeten samenvallen.
            </p>
            {uitlijnen.bezig || wachtOpUitlijning ? (
              <p className="hulp">Uitlijnen…</p>
            ) : verschuiving ? (
              <>
                <p className={uitlijnen.zekerheid !== null && uitlijnen.zekerheid >= ZEKER_UITGELIJND ? "status-goed" : "status-nakijken"}>
                  {uitlijnen.zekerheid === null
                    ? "Zoals bevestigd."
                    : uitlijnen.zekerheid >= ZEKER_UITGELIJND
                      ? "✔ De muren vallen samen."
                      : "⚠ Niet zeker: kijk na of de blauwe muren op het plan vallen."}{" "}
                  <span className="hulp">
                    De tekening staat op dit blad {plaatsOpBlad(verschuiving, referentie.kalibratie)}
                    {verschuiving.kwartslagen
                      ? `, en ${verschuiving.kwartslagen === 1 ? "een kwartslag" : `${verschuiving.kwartslagen} kwartslagen`} gedraaid`
                      : ""}
                    .
                  </span>
                </p>
                {uitlijnen.alternatieven.length > 0 ? (
                  <div className="knoppenrij">
                    <span className="hulp">Ook mogelijk:</span>
                    {uitlijnen.alternatieven.map((a) => (
                      <button
                        key={`${a.dx},${a.dy}`}
                        type="button"
                        className="stil"
                        onClick={() => setVerschuiving({ ...verschuiving, dx: a.dx, dy: a.dy })}
                      >
                        {plaatsOpBlad(a, referentie.kalibratie, true)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="schuifknoppen" role="group" aria-label="De blauwe tekening verschuiven">
                  <button type="button" className="stil" onClick={() => schuif(0, -stap)} aria-label="Omhoog">
                    ↑
                  </button>
                  <button type="button" className="stil" onClick={() => schuif(-stap, 0)} aria-label="Naar links">
                    ←
                  </button>
                  <button type="button" className="stil" onClick={() => schuif(stap, 0)} aria-label="Naar rechts">
                    →
                  </button>
                  <button type="button" className="stil" onClick={() => schuif(0, stap)} aria-label="Omlaag">
                    ↓
                  </button>
                  <select value={stap} onChange={(g) => setStap(Number(g.currentTarget.value))} aria-label="Stap">
                    <option value={0.01}>1 cm</option>
                    <option value={0.1}>10 cm</option>
                  </select>
                </div>
                <div className="knoppenrij">
                  <label className="keuzevak">
                    <input type="checkbox" checked={toonReferentie} onChange={(g) => setToonReferentie(g.currentTarget.checked)} />
                    Toon de blauwe tekening
                  </label>
                </div>
                <div className="knoppenrij">
                  <button type="button" className="stil" onClick={() => setModus({ soort: "punt", eerste: null })}>
                    Eén punt aanduiden
                  </button>
                  <button type="button" className="stil" onClick={() => lijnUit(((verschuiving.kwartslagen ?? 0) + 1) % 4)}>
                    Kwartslag draaien
                  </button>
                  <button type="button" className="stil" onClick={() => lijnUit(verschuiving.kwartslagen)}>
                    Opnieuw uitlijnen
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <section className="kaart">
          <h3>
            Ruimtes <span className="hulp">· {mee.length} mee, samen {m2(totaal)}</span>
          </h3>
          <ul className="ruimtelijst">
            {ruimtes.map((r) => {
              const koppeling = verschil?.koppelingen.find((k) => k.sleutel === r.sleutel);
              return (
                <li key={r.sleutel} id={`ruimte-${r.sleutel}`} className={r.sleutel === gekozen ? "gekozen" : undefined}>
                  <input
                    type="checkbox"
                    checked={r.mee}
                    onChange={(g) => wijzig(r.sleutel, { mee: g.currentTarget.checked })}
                    aria-label={`${r.naam || "Ruimte zonder naam"} meenemen`}
                  />
                  <button type="button" className="rij" onClick={() => setGekozen(r.sleutel)}>
                    <span>
                      <span className={r.status === "goed" ? "status-goed" : "status-nakijken"}>{r.status === "goed" ? "✔" : "⚠"}</span>{" "}
                      {r.naam || <em>zonder naam</em>}
                      {koppeling?.ruimteId && koppeling.oudeOppervlakte !== null && Math.abs(koppeling.oudeOppervlakte - r.oppervlakte) >= 0.05 ? (
                        <span className="hulp"> · was {m2(koppeling.oudeOppervlakte)}</span>
                      ) : null}
                      {!koppeling?.ruimteId && bestaand.length > 0 && r.mee ? <span className="hulp"> · nieuw</span> : null}
                    </span>
                    <span className="hulp">{m2(r.oppervlakte)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {gekozenRuimte ? (
            <div className="ruimtedetail">
              <div className="veldenrij">
                <div>
                  <label htmlFor="ruimte-naam">Naam</label>
                  <input id="ruimte-naam" value={gekozenRuimte.naam} maxLength={60} onChange={(g) => hernoem(gekozenRuimte.sleutel, g.currentTarget.value)} />
                  {gekozenRuimte.naamPlan && gekozenRuimte.naamPlan !== gekozenRuimte.naam ? (
                    <p className="hulp">
                      Op het plan: {gekozenRuimte.naamPlan}.{" "}
                      <button type="button" className="link" onClick={() => hernoem(gekozenRuimte.sleutel, gekozenRuimte.naamPlan)}>
                        Neem over
                      </button>
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="ruimte-soort">Soort</label>
                  <select
                    id="ruimte-soort"
                    value={gekozenRuimte.soort}
                    onChange={(g) => {
                      const soort = g.currentTarget.value;
                      if (isSoortRuimte(soort)) wijzig(gekozenRuimte.sleutel, { soort, soortGekozen: true });
                    }}
                  >
                    {SOORTEN_RUIMTE.map((soort) => (
                      <option key={soort} value={soort}>
                        {RUIMTENAMEN[soort]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="veldenrij">
                <div>
                  <label htmlFor="ruimte-plafond">Plafondhoogte (m)</label>
                  <input
                    id="ruimte-plafond"
                    inputMode="decimal"
                    placeholder={komma(voorstel.verdieping.plafondhoogte ?? verdieping.plafondhoogte_m) || "zoals de verdieping"}
                    defaultValue={komma(gekozenRuimte.plafondhoogte)}
                    key={`plafond-${gekozenRuimte.sleutel}`}
                    onBlur={(g) => {
                      const waarde = getal(g.currentTarget.value, "De plafondhoogte");
                      if (!waarde.ok || (waarde.waarde !== null && (waarde.waarde <= 0 || waarde.waarde > 20))) {
                        return setMelding({ soort: "fout", tekst: "De plafondhoogte is een getal tussen 0 en 20 m." });
                      }
                      wijzig(gekozenRuimte.sleutel, { plafondhoogte: waarde.waarde });
                    }}
                  />
                </div>
              </div>
              <p className="hulp">
                {gekozenRuimte.oppervlaktePlan !== null ? `Op het plan ${m2(gekozenRuimte.oppervlaktePlan)}; ` : ""}
                berekend {m2(gekozenRuimte.oppervlakte)}.{" "}
                {gekozenRuimte.redenen.length > 0 ? `Na te kijken: ${gekozenRuimte.redenen.join(", ")}.` : ""}
              </p>
              <div className="knoppenrij">
                <button type="button" className="stil" onClick={() => setModus({ soort: "splitsen", sleutel: gekozenRuimte.sleutel, punten: [] })}>
                  Splitsen
                </button>
                <button type="button" className="stil" onClick={() => setGekozen(null)}>
                  Sluiten
                </button>
              </div>
            </div>
          ) : null}

          <div className="knoppenrij" style={{ marginTop: 10 }}>
            {modus.soort === "toevoegen" ? (
              <button type="button" className="stil" onClick={() => setModus({ soort: "kiezen" })}>
                Klaar met toevoegen
              </button>
            ) : (
              <button
                type="button"
                className="stil"
                disabled={kandidaten.length === 0}
                onClick={() => setModus({ soort: "toevoegen" })}
                title={kandidaten.length === 0 ? "Er zijn geen witte vlakken meer om toe te voegen." : undefined}
              >
                Ruimte toevoegen ({kandidaten.length})
              </button>
            )}
            {tikt && modus.soort !== "toevoegen" && modus.soort !== "schaal" ? (
              <button type="button" className="stil" onClick={() => setModus({ soort: "kiezen" })}>
                Annuleren
              </button>
            ) : null}
          </div>
        </section>

        <section className="kaart">
          <h3>Verdieping</h3>
          <p className="hulp">
            Volgens het plan: vloerpeil {voorstel.verdieping.vloerpeil === null ? "onbekend" : `${komma(voorstel.verdieping.vloerpeil)} m`},
            plafondhoogte {voorstel.verdieping.plafondhoogte === null ? "onbekend" : `${komma(voorstel.verdieping.plafondhoogte)} m`}.
            Nu bij {verdieping.naam}: {verdieping.vloerpeil_m === null ? "geen peil" : `${komma(verdieping.vloerpeil_m)} m`},{" "}
            {verdieping.plafondhoogte_m === null ? "geen plafondhoogte" : `${komma(verdieping.plafondhoogte_m)} m`}.
          </p>
          {voorstel.verdieping.vloerpeil !== null || voorstel.verdieping.plafondhoogte !== null ? (
            <label className="keuzevak">
              <input type="checkbox" checked={verdiepingBijwerken} onChange={(g) => setVerdiepingBijwerken(g.currentTarget.checked)} />
              {verdieping.naam} bijwerken met de waarden van het plan
            </label>
          ) : null}
        </section>

        {bestaand.length > 0 && verschil ? (
          <section className="kaart">
            <h3>Wijzigingen</h3>
            <ul className="wijzigingen">
              {mee.map((r) => {
                const k = verschil.koppelingen.find((koppeling) => koppeling.sleutel === r.sleutel);
                if (!k?.ruimteId) return <li key={r.sleutel}>Nieuw: {r.naam || "zonder naam"} ({m2(r.oppervlakte)})</li>;
                const delen: string[] = [];
                if (k.oudeNaam && k.oudeNaam !== r.naam) delen.push(`was ${k.oudeNaam}`);
                if (k.oudeOppervlakte !== null && Math.abs(k.oudeOppervlakte - r.oppervlakte) >= 0.05) {
                  delen.push(`${m2(k.oudeOppervlakte)} → ${m2(r.oppervlakte)}`);
                }
                return delen.length > 0 ? (
                  <li key={r.sleutel}>
                    {r.naam}: {delen.join(", ")}
                  </li>
                ) : null;
              })}
              {verschil.verdwenen.map((r) => (
                <li key={r.id}>
                  Verdwijnt: {r.naam} ({m2(r.oppervlakte)})
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="knoppenrij">
          <button type="button" onClick={() => void bevestig()} disabled={bezig || !s || wachtOpUitlijning || mee.length === 0}>
            {bezig ? "Even geduld…" : gegevens.bevestigd ? "Opnieuw bevestigen" : `${mee.length} ruimtes bevestigen`}
          </button>
        </div>
      </div>
    </div>
  );
}
