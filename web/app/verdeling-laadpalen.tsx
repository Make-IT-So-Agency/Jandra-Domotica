import { kwh } from "@/lib/format";
import type { Laadsessie } from "@/lib/types";

/**
 * Verhouding van het verbruik over de laadpalen, als tegel.
 *
 * Bewust een gestapelde balk en geen taartdiagram. Bij twee of drie stukken
 * leest een balk de verhouding beter af, en zeker bij waardes die dicht bij
 * elkaar liggen; een cirkel dwingt de lezer hoeken te vergelijken. Een balk
 * past ook in een tegel zonder de rest weg te duwen.
 */

// Vaste volgorde, en de kleur hangt aan de laadpaal en niet aan zijn grootte:
// wordt een paal volgende maand de kleinste, dan houdt hij dezelfde kleur.
// Bewust niet de statuskleuren van de app -- groen en oranje betekenen op dit
// scherm al "afgerond" en "loopt nog".
const REEKSKLEUREN = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OVERIGE_KLEUR = "#6b7280";

interface Deel {
  laadpaal: string;
  kwh: number;
  aandeel: number;
  kleur: string;
}

export function verdeelPerLaadpaal(sessies: Laadsessie[]): Deel[] {
  const perPaal = new Map<string, number>();

  for (const sessie of sessies) {
    if (!sessie.is_complete) continue;
    const energie = Number(sessie.energy_kwh);
    if (!Number.isFinite(energie) || energie <= 0) continue;

    const naam = sessie.loadpoint_name?.trim() || "onbekend";
    perPaal.set(naam, (perPaal.get(naam) ?? 0) + energie);
  }

  // Op naam sorteren en niet op grootte, zodat de kleuren en de volgorde van
  // maand tot maand hetzelfde blijven.
  const opNaam = [...perPaal.entries()].sort(([a], [b]) => a.localeCompare(b, "nl"));
  const totaal = opNaam.reduce((som, [, waarde]) => som + waarde, 0);
  if (totaal <= 0) return [];

  const genoemd = opNaam.slice(0, REEKSKLEUREN.length);
  const rest = opNaam.slice(REEKSKLEUREN.length);

  const delen: Deel[] = genoemd.map(([laadpaal, waarde], index) => ({
    laadpaal,
    kwh: Math.round(waarde * 1000) / 1000,
    aandeel: waarde / totaal,
    kleur: REEKSKLEUREN[index],
  }));

  // Meer palen dan kleuren: de rest wordt één grijze groep in plaats van een
  // zesde kleur die niemand meer uit elkaar houdt.
  if (rest.length > 0) {
    const samen = rest.reduce((som, [, waarde]) => som + waarde, 0);
    delen.push({
      laadpaal: `${rest.length} overige`,
      kwh: Math.round(samen * 1000) / 1000,
      aandeel: samen / totaal,
      kleur: OVERIGE_KLEUR,
    });
  }

  return delen;
}

function percent(aandeel: number): string {
  return `${Math.round(aandeel * 100)} %`;
}

export function VerdelingPerLaadpaal({ sessies }: { sessies: Laadsessie[] }) {
  const delen = verdeelPerLaadpaal(sessies);

  if (delen.length === 0) {
    return (
      <div className="tegel">
        <div className="label">Verdeling per laadpaal</div>
        <p className="bij" style={{ marginTop: 8 }}>
          Deze maand nog geen afgeronde sessies.
        </p>
      </div>
    );
  }

  // Eén laadpaal is geen verhouding. Dan is het getal het hele verhaal.
  if (delen.length === 1) {
    return (
      <div className="tegel">
        <div className="label">Verdeling per laadpaal</div>
        <div className="waarde">100 %</div>
        <div className="bij">alles via {delen[0].laadpaal}</div>
      </div>
    );
  }

  const BREEDTE = 100;
  const KIER = 0.8; // in dezelfde eenheden als de balk; wordt 2px op het scherm
  const beschikbaar = BREEDTE - KIER * (delen.length - 1);

  let x = 0;
  const stukken = delen.map((deel) => {
    const breedte = Math.max(deel.aandeel * beschikbaar, 0.6);
    const stuk = { ...deel, x, breedte };
    x += breedte + KIER;
    return stuk;
  });

  const samenvatting = delen
    .map((deel) => `${deel.laadpaal} ${percent(deel.aandeel)}`)
    .join(", ");

  return (
    <div className="tegel tegel-breed">
      <div className="label">Verdeling per laadpaal</div>

      <svg
        className="verdeling-balk"
        viewBox={`0 0 ${BREEDTE} 8`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Verdeling van het verbruik deze maand: ${samenvatting}`}
      >
        {stukken.map((stuk) => (
          <rect
            key={stuk.laadpaal}
            x={stuk.x}
            y={0}
            width={stuk.breedte}
            height={8}
            rx={1.5}
            fill={stuk.kleur}
          >
            <title>{`${stuk.laadpaal}: ${kwh(stuk.kwh)} (${percent(stuk.aandeel)})`}</title>
          </rect>
        ))}
      </svg>

      {/* De namen en getallen staan er voluit bij: de verhouding mag nooit
          alleen aan de kleur hangen. */}
      <dl className="verdeling-legende">
        {delen.map((deel) => (
          <div key={deel.laadpaal}>
            <dt>
              <span className="verdeling-stip" style={{ background: deel.kleur }} aria-hidden="true" />
              {deel.laadpaal}
            </dt>
            <dd>
              {percent(deel.aandeel)}
              <span className="verdeling-kwh">{kwh(deel.kwh)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
