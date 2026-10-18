import {
  KNX_BUSKABEL,
  LAADVERMOGENS,
  STROMEN,
  kva,
  type Batterij,
  type Beveiliging,
  type Differentieel,
  type Domotica,
  type Domoticasysteem,
  type Kastplaats,
  type Kring,
  type Laadvermogen,
  type Netwerk,
  type Techniekinstellingen,
} from "./voorstel";

/**
 * Hoe het voorstel voor de technieken er in woorden uitziet: op de pagina en
 * in de PDF hetzelfde. Puur.
 */

export const meters = (lengte: number | null) => (lengte === null ? "—" : `± ${lengte} m`);

export const beveiligingTekst = (b: Beveiliging) => `${b.polen} ${b.ampere} A`;

/** "300 mA type A", of "30 mA type A (2)" als er meer van zijn. */
export function differentieelTekst(d: Differentieel, alle: readonly Differentieel[]): string {
  const zelfde = alle.filter((x) => x.gevoeligheid === d.gevoeligheid && x.type === d.type);
  const nummer = zelfde.length > 1 ? ` (${zelfde.indexOf(d) + 1})` : "";
  return `${d.gevoeligheid} mA type ${d.type}${nummer}`;
}

/** Wat meetelt in een kring: "8 contactdozen", "5 lichtpunten", "3 motoren"; een toestel: "1 toestel". */
export function tellingTekst(kring: Kring): string {
  const n = kring.telling;
  switch (kring.soort) {
    case "stopcontacten":
    case "aanrecht":
      return n === 1 ? "1 contactdoos" : `${n} contactdozen`;
    case "verlichting":
      return n === 1 ? "1 lichtpunt" : `${n} lichtpunten`;
    case "badkamer":
    case "buiten":
      return n === 1 ? "1 punt" : `${n} punten`;
    case "rolluiken":
      return n === 1 ? "1 motor" : `${n} motoren`;
    case "domotica":
    case "netwerk":
      return "de kast";
    default:
      return "1 toestel";
  }
}

/** De ruimtes van een kring, elk één keer; leeg als de kring al zo heet (de kring Badkamer, in de badkamer). */
export function ruimtesTekst(kring: Kring): string {
  const ruimtes = [...new Set(kring.punten.map((p) => p.ruimte ?? "buiten"))];
  return ruimtes.length === 1 && ruimtes[0].toLowerCase() === kring.naam.toLowerCase() ? "" : ruimtes.join(", ");
}

/** "a, b en c". */
function opsomming(delen: readonly string[]): string {
  return delen.length <= 1 ? (delen[0] ?? "") : `${delen.slice(0, -1).join(", ")} en ${delen.at(-1)}`;
}

const telwoord = (aantal: number, een: string, meer: string) => `${aantal} ${aantal === 1 ? een : meer}`;

/** Een opsomming van aantallen, zonder wat nul is. */
const tellingen = (lijst: readonly [number, string, string][]) => opsomming(lijst.filter(([n]) => n > 0).map(([n, een, meer]) => telwoord(n, een, meer)));

/** Wat de domoticakast stuurt en leest, zonder wat er niet is: "11 relais, 5 dimmers en 2 motoren; 8 drukknoppen en 2 melders". */
export function domoticaTekst(d: Pick<Domotica, "relais" | "dimmers" | "led" | "motoren" | "drukknoppen" | "melders">): string {
  const uitgangen = tellingen([
    [d.relais, "relais", "relais"],
    [d.dimmers, "dimmer", "dimmers"],
    [d.led, "ledsturing", "ledsturingen"],
    [d.motoren, "motor", "motoren"],
  ]);
  const ingangen = tellingen([
    [d.drukknoppen, "drukknop", "drukknoppen"],
    [d.melders, "melder", "melders"],
  ]);
  return `${uitgangen || "geen uitgangen"}; ${ingangen || "geen drukknoppen of melders"}`;
}

/** De KNX-installatie in één zin: hoeveel toestellen, op hoeveel lijnen, en hoe Home Assistant eraan hangt. */
export function knxTekst(knx: NonNullable<Domotica["knx"]>): string {
  return (
    `${telwoord(knx.toestellen, "KNX-toestel", "KNX-toestellen")} op ${telwoord(knx.lijnen, "lijn", "lijnen")}: ` +
    "de drukknoppen en de melders op de groene buskabel, doorgelust van toestel tot toestel (geen ring), de actoren in de domoticakast, " +
    `en Home Assistant via ${knx.lijnen === 1 ? "de IP-router" : "de IP-routers"}.`
  );
}

/** Een kabel naar de domoticakast: "12 × XVB 3G1,5 (± 140 m)", of de buskabel langs haar toestellen. */
export function domoticakabelTekst(k: { soort: string; aantal: number; lengte: number | null }): string {
  return k.soort === KNX_BUSKABEL
    ? `de ${KNX_BUSKABEL}, doorgelust langs ${telwoord(k.aantal, "toestel", "toestellen")} (${meters(k.lengte)})`
    : `${k.aantal} × ${k.soort} (${meters(k.lengte)})`;
}

/** Wat er in de netwerkkast komt, en hoeveel kabel: onder de tabel van de poorten. */
export function netwerkTekst(n: Pick<Netwerk, "patchpanelen" | "switchpoorten" | "poe" | "hoogte" | "kabellengte" | "telang">): string {
  const poe = n.poe > 0 ? ` met minstens ${n.poe} PoE-poorten (wifi, camera's, deurbel)` : "";
  const telang = n.telang > 0 ? ` ${telwoord(n.telang, "kabel is", "kabels zijn")} langer dan 90 m: daar haalt UTP de volle snelheid niet.` : "";
  return (
    `${telwoord(n.patchpanelen, "patchpaneel", "patchpanelen")} van 24, een switch van ${n.switchpoorten} poorten${poe}, en een wandkast van ${n.hoogte} U ` +
    `met plaats voor de router, de modem en een stekkerdoos. UTP cat. 6, één kabel per poort: ${meters(n.kabellengte)}.${telang}`
  );
}

/** Een getal met een komma, zoals op het scherm: "9,6". */
export const komma = (getal: number) => String(getal).replace(".", ",");

/** De aansluitingen om uit te kiezen: "3x25" is drie fasen van 25 A. */
export function aansluitingen(): { waarde: string; naam: string }[] {
  return ([1, 3] as const).flatMap((fasen) =>
    STROMEN[fasen].map((stroom) => ({
      waarde: `${fasen}x${stroom}`,
      naam: `${fasen === 1 ? "Eén fase, 230 V" : "Drie fasen, 3N400 V"}, ${stroom} A (${komma(kva({ fasen, stroom }))} kVA)`,
    })),
  );
}

export const aansluitingTekst = (i: Pick<Techniekinstellingen, "fasen" | "stroom">) =>
  `${i.fasen === 1 ? "Eén fase, 230 V" : "Drie fasen, 3N400 V"}, ${i.stroom} A (${komma(kva(i))} kVA)`;

export const DOMOTICANAMEN: Record<Domoticasysteem, string> = {
  geen: "Geen domotica",
  knx: "KNX met Home Assistant",
  ander: "Ander systeem (los van het merk)",
};

export const laadpaalTekst = (kw: Laadvermogen) =>
  `${komma(kw)} kW: ${kw === 7.4 ? "één fase van 32 A" : kw === 11 ? "drie fasen van 16 A" : "drie fasen van 32 A"}`;

/** De laadpalen om uit te kiezen; "" is geen. */
export function laadpalen(): { waarde: string; naam: string }[] {
  return [{ waarde: "", naam: "Geen laadpaal" }, ...LAADVERMOGENS.map((kw) => ({ waarde: String(kw), naam: laadpaalTekst(kw) }))];
}

export const BATTERIJNAMEN: Record<Batterij, string> = {
  hybride: "Hybride: aan de omvormer van de panelen",
  eigen: "Met een eigen omvormer",
};

/** De uitgangspunten in woorden, een regel per onderwerp: voor de PDF. */
export function uitgangspunten(i: Techniekinstellingen): string[] {
  return [
    `Aansluiting: ${aansluitingTekst(i)}.`,
    `Domotica: ${i.domotica === "geen" ? "geen" : i.domotica === "knx" ? "KNX met Home Assistant" : "een ander systeem, los van het merk"}.`,
    `Laadpaal: ${i.laadpaal === null ? "geen, of zoals op het plan" : laadpaalTekst(i.laadpaal)}.`,
    `Zonnepanelen: ${i.zonnepanelen === null ? "geen, of zoals op het dak in 3D" : `${komma(i.zonnepanelen)} kWp`}.`,
    `Thuisbatterij: ${i.batterij === null ? "geen, of zoals in 3D" : BATTERIJNAMEN[i.batterij].toLowerCase()}.`,
  ];
}

/** Waar een kast staat, in woorden: "Berging (woning · gelijkvloers): waar de verdeelkast bij Inrichten staat." */
export function plaatsTekst(plaats: Kastplaats | null, verdiepingen: readonly { id: number; naam: string }[]): string {
  if (!plaats) return "Nog geen verdiepingen met ruimtes.";
  const verdieping = verdiepingen.find((v) => v.id === plaats.verdiepingId)?.naam.toLowerCase() ?? "";
  const waar = plaats.ruimte ? `${plaats.ruimte} (${verdieping})` : verdieping;
  switch (plaats.bron) {
    case "verdeelkast":
    case "meterkast":
    case "domoticakast":
    case "netwerkkast":
      return `${waar.charAt(0).toUpperCase()}${waar.slice(1)}: waar de ${plaats.bron} bij Inrichten staat.`;
    case "ruimte":
      return `${waar}: de technische ruimte, anders de berging, de wasplaats of de garage.`;
    case "midden":
      return `Nog geen technische ruimte of berging: de app rekent vanuit het midden van ${verdieping}.`;
  }
}
