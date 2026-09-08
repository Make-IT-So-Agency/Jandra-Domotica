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
//
// De hex-waardes staan in globals.css en niet hier, omdat de donkere modus
// eigen stappen van dezelfde tinten nodig heeft: de lichte stappen zijn te
// fel op een donkere tegel. Zo staat die omschakeling op één plek.
const REEKSKLEUREN = [
  "var(--reeks-1)",
  "var(--reeks-2)",
  "var(--reeks-3)",
  "var(--reeks-4)",
  "var(--reeks-5)",
];
const OVERIGE_KLEUR = "var(--reeks-overig)";

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

  const samenvatting = delen
    .map((deel) => `${deel.laadpaal} ${percent(deel.aandeel)}`)
    .join(", ");

  return (
    <div className="tegel tegel-breed">
      <div className="label">Verdeling per laadpaal</div>

      {/* Geen SVG maar gewone vakken naast elkaar. De balk wordt uitgerekt tot
          de tegelbreedte; in een SVG rekt dan ook de afronding van de hoeken
          mee uit, en een minimumbreedte zou in tekeneenheden moeten in plaats
          van in pixels. Met flexbox blijven de afronding, de kier van 2px en
          de minimumbreedte gewoon pixels, en verdeelt de browser zelf wat er
          van de grote stukken af moet om de kleine hun minimum te geven. */}
      <div
        className="verdeling-balk"
        role="img"
        aria-label={`Verdeling van het verbruik deze maand: ${samenvatting}`}
      >
        {delen.map((deel) => (
          <div
            key={deel.laadpaal}
            className="verdeling-stuk"
            style={{ flexBasis: `${deel.aandeel * 100}%`, background: deel.kleur }}
            title={`${deel.laadpaal}: ${kwh(deel.kwh)} (${percent(deel.aandeel)})`}
          />
        ))}
      </div>

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
