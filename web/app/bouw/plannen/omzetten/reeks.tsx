"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { kaderVan, middenVan, naarHuis, type Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import { zetOm } from "@/lib/bouw/omzetting/pijplijn";
import {
  afhankelijk,
  bevestigingVoor,
  lijnBladUit,
  meegaand,
  neemNamenOver,
  planstatus,
  verschilVoor,
  type Planstatus,
  type Uitgelijnd,
  type Verdiepinginfo,
} from "@/lib/bouw/omzetting/reeks";
import { kiesReferentie, type Planinfo, type Referentie } from "@/lib/bouw/omzetting/referentie";
import type { Oudruimte, Ruimteverschil } from "@/lib/bouw/omzetting/ruimtediff";
import type { Blad, Ruimtevoorstel, Voorstel, Xy } from "@/lib/bouw/omzetting/types";
import type { Lijnstuk } from "@/lib/bouw/omzetting/uitlijnen";
import { pdfFout } from "@/lib/bouw/pdf";

import { bevestigOmzettingActie } from "../[id]/omzetten/acties";
import { leesReferentie, leesVersieblad, murenInHuis } from "../omzetting-lezen";

export interface Reeksgegevens {
  huisId: number;
  /** De plannen in de volgorde waarin ze gelezen en bewaard worden. */
  reeks: {
    planId: number;
    titel: string;
    versie: { id: number; label: string; bestandId: number; pagina: number };
    verdieping: { id: number; naam: string };
    /** Enkel als er meer dan één gebouw is. */
    gebouw: string | null;
    dubbel: boolean;
  }[];
  /** Alle plannen en verdiepingen, om de referentie te kiezen zoals het nakijkscherm. */
  plannen: Planinfo[];
  verdiepingen: Verdiepinginfo[];
  /** De versies die al bevestigd zijn. */
  bevestigd: number[];
  /** De ruimtes die elke verdieping nu heeft, in meter. */
  bestaand: Record<number, Oudruimte[]>;
}

type Item = Reeksgegevens["reeks"][number];

interface Gelezen {
  stap: "gelezen";
  voorstel: Voorstel;
  /** Null zonder schaal. */
  kalibratie: Kalibratie | null;
  referentie: { versieId: number; op: string; inReeks: boolean } | null;
  referentielijnen: Lijnstuk[];
  uitlijning: Uitgelijnd | null;
  ruimtes: Ruimtevoorstel[];
  verschil: Ruimteverschil | null;
  status: Planstatus;
}

type Stand = { stap: "wacht" } | { stap: "lezen" } | { stap: "fout"; melding: string } | Gelezen;

type Bewaren = { soort: "bezig" } | { soort: "bewaard" } | { soort: "fout"; melding: string };

const m2 = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m²`;
const meervoud = (aantal: number, een: string, meer: string) => `${aantal} ${aantal === 1 ? een : meer}`;

/** Even wachten, zodat wat er op het scherm moet komen er staat voor het zware rekenwerk. */
const adem = () => new Promise<void>((klaar) => window.setTimeout(klaar, 30));

/** Waarop een plan uitgelijnd wordt, zoals het op de kaart staat. */
function referentienaam(referentie: Referentie): string {
  return referentie.soort === "versie" ? `de vorige versie (${referentie.label})` : referentie.verdieping || referentie.planTitel;
}

/** Een SVG-pad voor een ruimte: de buitenrand en de gaten, met evenodd. */
function pad(ringen: Xy[][]): string {
  return ringen.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join("L")}Z`).join("");
}

/**
 * Alle grondplannen na elkaar: lezen, uitlijnen, de namen overnemen, en per
 * plan zeggen of het zonder nakijken mag. Bevestigen gaat plan per plan, in
 * dezelfde volgorde, met de actie van het nakijkscherm.
 */
export default function Reeks({ gegevens }: { gegevens: Reeksgegevens }) {
  const router = useRouter();
  // Na elke bevestiging stuurt de server de pagina opnieuw, met een kortere
  // reeks. Wat hier gelezen werd, blijft gelden: de reeks van het begin.
  const [begin] = useState(gegevens);
  const items = begin.reeks;
  const [standen, setStanden] = useState<Record<number, Stand>>(() =>
    Object.fromEntries(items.map((item) => [item.versie.id, { stap: "wacht" } as Stand])),
  );
  const [aan, setAan] = useState<Set<number>>(() => new Set());
  const [bewaren, setBewaren] = useState<Record<number, Bewaren>>({});
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    const zet = (versieId: number, stand: Stand) => setStanden((huidig) => ({ ...huidig, [versieId]: stand }));

    // Een plan dat klaar is, kan de referentie zijn voor de volgende verdieping.
    const bevestigd = new Set(begin.bevestigd);
    const plannen: Planinfo[] = begin.plannen.map((plan) => ({ ...plan, versies: plan.versies.map((v) => ({ ...v })) }));
    const inReeks = new Map<number, { blad: Blad; voorstel: Voorstel; kalibratie: Kalibratie }>();
    const referenties = new Map<number, Promise<Lijnstuk[]>>();

    async function verwerk(item: Item): Promise<Gelezen> {
      const blad = await leesVersieblad(begin.huisId, {
        versieId: item.versie.id,
        bestandId: item.versie.bestandId,
        pagina: item.versie.pagina,
      });
      await adem();
      const voorstel = zetOm(blad);
      const bestaand = begin.bestaand[item.verdieping.id] ?? [];
      const geen = { referentie: null, referentielijnen: [], uitlijning: null };
      if (!voorstel.schaal) {
        const status = planstatus({ dubbel: false, voorstel, ruimtes: voorstel.ruimtes, uitlijning: null, verdwenen: [] });
        return { stap: "gelezen", voorstel, kalibratie: null, ...geen, ruimtes: voorstel.ruimtes, verschil: null, status };
      }

      const meterPerPunt = voorstel.schaal.meterPerPunt;
      const referentie = kiesReferentie(
        { planId: item.planId, versieId: item.versie.id, verdiepingId: item.verdieping.id },
        plannen,
        begin.verdiepingen,
        bevestigd,
      );
      let kalibratie: Kalibratie = { meterPerPunt, kwartslagen: 0, dx: 0, dy: 0 };
      let uitlijning: Uitgelijnd | null = null;
      let referentielijnen: Lijnstuk[] = [];
      const eerder = referentie ? inReeks.get(referentie.versieId) : undefined;
      if (referentie) {
        if (eerder) {
          referentielijnen = murenInHuis(eerder.blad, eerder.kalibratie, eerder.voorstel.gebied);
        } else {
          if (!referenties.has(referentie.versieId)) {
            referenties.set(referentie.versieId, leesReferentie(begin.huisId, referentie).catch(() => []));
          }
          referentielijnen = (await referenties.get(referentie.versieId)) ?? [];
        }
        await adem();
        uitlijning = lijnBladUit({
          blad,
          voorstel,
          meterPerPunt,
          referentie: { soort: referentie.soort, kalibratie: referentie.kalibratie },
          referentielijnen,
          bestaand,
        });
        kalibratie = uitlijning.kalibratie;
      }

      const ruimtes = neemNamenOver(voorstel.ruimtes, bestaand, kalibratie);
      const verschil = verschilVoor(ruimtes, bestaand, kalibratie);
      const op = referentie ? referentienaam(referentie) : "";
      const status = planstatus({
        dubbel: false,
        voorstel,
        ruimtes,
        uitlijning: uitlijning ? { ...uitlijning, op } : null,
        verdwenen: verschil.verdwenen.map((r) => r.naam),
      });
      if (status.oordeel === "klaar") {
        bevestigd.add(item.versie.id);
        const versie = plannen.find((plan) => plan.id === item.planId)?.versies.find((v) => v.id === item.versie.id);
        if (versie) versie.kalibratie = { ...kalibratie };
        inReeks.set(item.versie.id, { blad, voorstel, kalibratie });
      }
      return {
        stap: "gelezen",
        voorstel,
        kalibratie,
        referentie: referentie ? { versieId: referentie.versieId, op, inReeks: eerder !== undefined } : null,
        referentielijnen,
        uitlijning,
        ruimtes,
        verschil,
        status,
      };
    }

    (async () => {
      for (const item of items) {
        if (weg) return;
        if (item.dubbel) {
          zet(item.versie.id, { stap: "fout", melding: "Aan deze verdieping hangt nog een grondplan. Zet het juiste apart om." });
          continue;
        }
        zet(item.versie.id, { stap: "lezen" });
        await adem();
        try {
          const gelezen = await verwerk(item);
          if (weg) return;
          zet(item.versie.id, gelezen);
          if (gelezen.status.oordeel === "klaar") setAan((huidig) => new Set(huidig).add(item.versie.id));
        } catch (oorzaak) {
          if (!weg) zet(item.versie.id, { stap: "fout", melding: pdfFout(oorzaak) });
        }
      }
    })();
    return () => {
      weg = true;
    };
  }, [begin, items]);

  const klaarMetLezen = items.every((item) => standen[item.versie.id]?.stap === "gelezen" || standen[item.versie.id]?.stap === "fout");
  const nuBezig = items.findIndex((item) => standen[item.versie.id]?.stap === "lezen");
  const gelezen = (item: Item) => {
    const stand = standen[item.versie.id];
    return stand?.stap === "gelezen" ? stand : null;
  };
  const bewaard = (item: Item) => bewaren[item.versie.id]?.soort === "bewaard";

  // Wat op een plan ligt dat niet meegaat, kan zelf niet mee.
  const ketting = items.map((item) => {
    const g = gelezen(item);
    return { versieId: item.versie.id, referentieVersieId: g?.referentie?.inReeks ? g.referentie.versieId : null };
  });
  const nietMee = new Set(items.filter((item) => !aan.has(item.versie.id) && !bewaard(item)).map((item) => item.versie.id));
  const geblokkeerd = afhankelijk(ketting, nietMee);
  const kanMee = (item: Item) => {
    const g = gelezen(item);
    return g !== null && g.status.oordeel !== "kan-niet" && !bewaard(item);
  };
  const mee = items.filter((item) => kanMee(item) && aan.has(item.versie.id) && !geblokkeerd.has(item.versie.id));

  const wissel = (versieId: number) =>
    setAan((huidig) => {
      const nieuw = new Set(huidig);
      if (!nieuw.delete(versieId)) nieuw.add(versieId);
      return nieuw;
    });

  async function bevestigAlles() {
    setBezig(true);
    setMelding(null);
    let plannen = 0;
    let ruimtes = 0;
    for (const item of mee) {
      const g = gelezen(item);
      const bevestiging =
        g?.kalibratie && g.verschil
          ? bevestigingVoor({
              versieId: item.versie.id,
              voorstel: g.voorstel,
              kalibratie: g.kalibratie,
              referentieVersieId: g.referentie?.versieId ?? null,
              ruimtes: g.ruimtes,
              verschil: g.verschil,
            })
          : null;
      setBewaren((huidig) => ({ ...huidig, [item.versie.id]: { soort: "bezig" } }));
      const uitkomst = bevestiging ? await bevestigOmzettingActie(begin.huisId, bevestiging).catch(() => null) : null;
      if (!uitkomst?.ok) {
        const tekst = !bevestiging ? "Dit plan kan niet bevestigd worden." : !uitkomst ? "Geen verbinding met de app." : uitkomst.melding;
        setBewaren((huidig) => ({ ...huidig, [item.versie.id]: { soort: "fout", melding: tekst } }));
        setMelding(
          `${item.titel}: ${tekst}${plannen > 0 ? ` ${meervoud(plannen, "plan ervoor is", "plannen ervoor zijn")} wel bewaard.` : ""} Probeer opnieuw.`,
        );
        setBezig(false);
        return;
      }
      plannen++;
      ruimtes += uitkomst.data.bijgewerkt + uitkomst.data.nieuw;
      setBewaren((huidig) => ({ ...huidig, [item.versie.id]: { soort: "bewaard" } }));
    }
    const tekst = `${meervoud(plannen, "plan", "plannen")} bevestigd, samen ${meervoud(ruimtes, "ruimte", "ruimtes")}.`;
    router.push(`/bouw/ruimtes?soort=goed&melding=${encodeURIComponent(tekst)}`);
    router.refresh();
  }

  const telling = (oordeel: Planstatus["oordeel"]) => items.filter((item) => gelezen(item)?.status.oordeel === oordeel).length;
  const fouten = items.filter((item) => standen[item.versie.id]?.stap === "fout").length;
  const samenvatting = [
    telling("klaar") > 0 ? `${telling("klaar")} klaar` : null,
    telling("nakijken") > 0 ? `${telling("nakijken")} na te kijken` : null,
    telling("kan-niet") + fouten > 0 ? `${telling("kan-niet") + fouten} kan hier niet` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const knop = (
    <button type="button" onClick={() => void bevestigAlles()} disabled={bezig || !klaarMetLezen || mee.length === 0}>
      {bezig ? "Bewaren…" : `${meervoud(mee.length, "plan", "plannen")} bevestigen`}
    </button>
  );

  return (
    <>
      <div className="melding info reeks-stand" role="status" aria-live="polite">
        {!klaarMetLezen
          ? `Plan ${Math.max(nuBezig, 0) + 1} van ${items.length} lezen${nuBezig >= 0 ? `: ${items[nuBezig].titel}` : ""}…`
          : `${meervoud(items.length, "grondplan", "grondplannen")} gelezen: ${samenvatting || "niets te doen"}.`}
      </div>
      {melding ? <div className="melding fout">{melding}</div> : null}
      {klaarMetLezen ? <div className="knoppenrij reeks-knoppen">{knop}</div> : null}

      <div className="reekskaarten">
        {items.map((item) => (
          <Kaart
            key={item.versie.id}
            item={item}
            stand={standen[item.versie.id] ?? { stap: "wacht" }}
            bewaren={bewaren[item.versie.id] ?? null}
            aangevinkt={aan.has(item.versie.id) && !geblokkeerd.has(item.versie.id)}
            geblokkeerd={geblokkeerd.has(item.versie.id)}
            kanVinken={kanMee(item) && !bezig}
            wissel={() => wissel(item.versie.id)}
          />
        ))}
      </div>

      {klaarMetLezen && items.length > 2 ? <div className="knoppenrij reeks-knoppen">{knop}</div> : null}
    </>
  );
}

function Kaart({
  item,
  stand,
  bewaren,
  aangevinkt,
  geblokkeerd,
  kanVinken,
  wissel,
}: {
  item: Item;
  stand: Stand;
  bewaren: Bewaren | null;
  aangevinkt: boolean;
  geblokkeerd: boolean;
  kanVinken: boolean;
  wissel: () => void;
}) {
  const g = stand.stap === "gelezen" ? stand : null;
  const oordeel = stand.stap === "fout" ? "kan-niet" : (g?.status.oordeel ?? "wacht");
  const statustekst =
    bewaren?.soort === "bewaard"
      ? "✔ Bewaard"
      : bewaren?.soort === "bezig"
        ? "Bewaren…"
        : stand.stap === "wacht"
          ? "Wacht"
          : stand.stap === "lezen"
            ? "Lezen…"
            : oordeel === "klaar"
              ? "✔ Klaar"
              : oordeel === "nakijken"
                ? "⚠ Nakijken"
                : "✘ Kan hier niet";
  const statusklasse = oordeel === "klaar" || bewaren?.soort === "bewaard" ? "status-goed" : oordeel === "wacht" ? "hulp" : "status-nakijken";
  const redenen = stand.stap === "fout" ? [stand.melding] : (g?.status.redenen ?? []);
  const gaan = g ? meegaand(g.ruimtes) : [];
  const waar = [item.gebouw, item.verdieping.naam, `versie ${item.versie.label}`].filter(Boolean).join(" · ");
  const titelId = `reeks-${item.versie.id}`;

  return (
    <article className={`kaart reekskaart ${oordeel}`} aria-labelledby={titelId}>
      <div className="reekskaart-kop">
        <label className="keuzevak">
          <input
            type="checkbox"
            checked={aangevinkt && bewaren?.soort !== "bewaard"}
            disabled={!kanVinken || geblokkeerd}
            onChange={wissel}
            aria-describedby={`${titelId}-status`}
          />
          <strong id={titelId}>{item.titel}</strong>
        </label>
        <span id={`${titelId}-status`} className={statusklasse}>
          {statustekst}
        </span>
      </div>
      <p className="hulp">
        {waar}
        {g?.referentie ? ` · uitgelijnd op ${g.referentie.op}` : g?.kalibratie ? " · eerste blad van dit gebouw" : ""}
      </p>

      {g?.kalibratie && g.ruimtes.length > 0 ? <Schets ruimtes={g.ruimtes} kalibratie={g.kalibratie} lijnen={g.referentielijnen} /> : null}

      {g && g.ruimtes.length > 0 ? (
        <p>
          {gaan.length === g.ruimtes.length
            ? meervoud(gaan.length, "ruimte", "ruimtes")
            : `${gaan.length} van de ${meervoud(g.ruimtes.length, "ruimte", "ruimtes")} ${gaan.length === 1 ? "gaat" : "gaan"} mee`}
          {gaan.length > 0 ? `, samen ${m2(gaan.reduce((som, r) => som + r.oppervlakte, 0))}` : ""}
          {gaan.length > 0 ? <span className="hulp"> · {gaan.map((r) => r.naam).join(", ")}</span> : null}
        </p>
      ) : null}

      {redenen.length > 0 ? (
        <ul className="reeks-redenen">
          {redenen.map((reden) => (
            <li key={reden}>{reden}</li>
          ))}
        </ul>
      ) : null}
      {geblokkeerd ? <p className="hulp">Dit plan ligt op {g?.referentie?.op}: vink dat eerst aan.</p> : null}
      {bewaren?.soort === "fout" ? <p className="status-nakijken">{bewaren.melding}</p> : null}

      {stand.stap === "gelezen" || stand.stap === "fout" ? (
        <p className="reeks-nakijken">
          <Link href={`/bouw/plannen/${item.planId}/omzetten?versie=${item.versie.id}`}>Nakijken</Link>
        </p>
      ) : null}
    </article>
  );
}

/**
 * Een kleine tekening van de ruimtes, in het gebouw gelegd: zo zie je in één
 * oogopslag of de verdieping op haar referentie (in blauw) ligt.
 */
function Schets({ ruimtes, kalibratie, lijnen }: { ruimtes: Ruimtevoorstel[]; kalibratie: Kalibratie; lijnen: Lijnstuk[] }) {
  const vormen = ruimtes.map((r) => ({ r, ringen: r.ringen.map((ring) => ring.map((p) => naarHuis(p, kalibratie))) }));
  const punten = [...vormen.flatMap((v) => v.ringen.flat()), ...lijnen.flat()];
  if (punten.length === 0) return null;
  const kader = kaderVan(punten);
  const marge = 0.5;
  const breedte = kader.x1 - kader.x0 + 2 * marge;
  const hoogte = kader.y1 - kader.y0 + 2 * marge;
  const letter = Math.max(breedte, hoogte) / 30;

  return (
    <svg
      className="schets"
      viewBox={`${kader.x0 - marge} ${kader.y0 - marge} ${breedte} ${hoogte}`}
      role="img"
      aria-label={`Schets van de ruimtes: ${ruimtes.map((r) => r.naam || "zonder naam").join(", ")}`}
    >
      {lijnen.length > 0 ? (
        <path
          className="laag-referentie"
          d={lijnen.map(([a, b]) => `M${a[0].toFixed(3)},${a[1].toFixed(3)}L${b[0].toFixed(3)},${b[1].toFixed(3)}`).join("")}
        />
      ) : null}
      {vormen.map(({ r, ringen }) => (
        <path
          key={r.sleutel}
          d={pad(ringen)}
          fillRule="evenodd"
          className={`laag-ruimte ${r.mee && r.naam.trim() ? r.status : "uit"}`}
        />
      ))}
      {vormen.map(({ r, ringen }) => {
        const [x, y] = middenVan(ringen);
        return (
          <text key={r.sleutel} x={x} y={y} fontSize={letter} strokeWidth={letter * 0.25} className="laag-naam">
            {r.naam || "?"}
          </text>
        );
      })}
    </svg>
  );
}
