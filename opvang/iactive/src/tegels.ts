/**
 * Wat een tegel in de kalender van i-Active betekent. Zuiver: geen browser,
 * zodat de regels getest kunnen worden.
 */

export type Staat =
  | "vrij"
  | "volzet"
  | "gesloten"
  | "nog_niet_open"
  | "ingeschreven"
  | "reservelijst"
  | "onbekend";

export interface RuweTegel {
  titel: string;
  klassen: string;
  iconen: string;
  balk: string;
}

/**
 * De iconen gaan voor: een tegel waarop het kind al ingeschreven is (✔) of
 * op de reservelijst staat (⏸), is dat, wat de titel ook zegt.
 */
export function leesStaat(t: RuweTegel): Staat {
  // Een tegel waarop het kind ingeschreven is: klasse "ingeschreven" en titel
  // "Ingeschreven" (gezien in november 2026). Voor de reservelijst verwachten
  // we hetzelfde patroon; het icoon uit de legende telt ook.
  if (/\bingeschreven\b/i.test(t.klassen) || /^\s*Ingeschreven\b/i.test(t.titel) || /\bfa-check-circle\b/.test(t.iconen)) {
    return "ingeschreven";
  }
  if (
    /\b(reservelijst|reserve|wachtlijst)\b/i.test(t.klassen) ||
    /^\s*(Op\s+(de\s+)?)?(reservelijst|wachtlijst)\b/i.test(t.titel) ||
    /\bfa-pause-circle\b/.test(t.iconen)
  ) {
    return "reservelijst";
  }
  if (/\bcalendaralert\b/.test(t.klassen) || /be[eë]indigd/i.test(t.titel)) return "gesloten";
  if (/^\s*Inschrijven\s+OP\s+RESERVELIJST/i.test(t.titel) || /\bpb_full\b/.test(t.klassen) || /^\s*RESERVE/i.test(t.balk)) {
    return "volzet";
  }
  if (/^\s*Inschrijven\s+tot/i.test(t.titel)) return "vrij";
  if (/vanaf|nog niet/i.test(t.titel) || !t.titel.trim()) return "nog_niet_open";
  return "onbekend";
}

/** Kan de bot op deze tegel inschrijven? Volzet mag: dan komt het kind op de reservelijst. */
export function inschrijfbaar(staat: Staat): boolean {
  return staat === "vrij" || staat === "volzet";
}

/** Is het kind voor dit slot al ingeschreven of op de reservelijst gezet? */
export function afgehandeld(staat: Staat): boolean {
  return staat === "ingeschreven" || staat === "reservelijst";
}

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

/** "december 2026" → "2026-12". */
export function maandVanTitel(titel: string): string | null {
  const t = titel.toLowerCase().match(/([a-z]+)\s+(\d{4})/);
  if (!t) return null;
  const i = MAANDEN.indexOf(t[1]);
  return i < 0 ? null : `${t[2]}-${String(i + 1).padStart(2, "0")}`;
}
