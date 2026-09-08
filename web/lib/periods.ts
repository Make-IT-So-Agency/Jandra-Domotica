/**
 * Rekenen met maanden en kwartalen in Belgische tijd.
 *
 * Sessies worden in UTC bewaard, maar een rapport over "januari" moet lopen
 * van 1 januari 00:00 Belgische tijd tot 1 februari 00:00 Belgische tijd.
 * In de winter scheelt dat een uur met UTC, in de zomer twee.
 */

export const TIJDZONE = "Europe/Brussels";

export type PeriodeSoort = "month" | "quarter";

export interface Periode {
  soort: PeriodeSoort;
  /** Eerste dag, als YYYY-MM-DD in Belgische tijd. */
  start: string;
  /** Laatste dag (inclusief), als YYYY-MM-DD in Belgische tijd. */
  eind: string;
  /** Begin van de periode als UTC-tijdstip. */
  vanaf: Date;
  /** Einde van de periode als UTC-tijdstip, exclusief. */
  tot: Date;
  label: string;
}

const MAANDNAMEN = [
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

/** Verschil tussen de tijdzone en UTC op een bepaald moment, in milliseconden. */
function zoneVerschilMs(moment: Date, tijdzone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tijdzone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const delen: Record<string, string> = {};
  for (const deel of formatter.formatToParts(moment)) {
    delen[deel.type] = deel.value;
  }

  const alsUtc = Date.UTC(
    Number(delen.year),
    Number(delen.month) - 1,
    Number(delen.day),
    Number(delen.hour) % 24,
    Number(delen.minute),
    Number(delen.second),
  );
  return alsUtc - moment.getTime();
}

/** Zet een lokale wandklokdatum om naar het overeenkomstige UTC-tijdstip. */
export function lokaleDatumNaarUtc(
  jaar: number,
  maand: number,
  dag: number,
  tijdzone: string = TIJDZONE,
): Date {
  const gok = Date.UTC(jaar, maand - 1, dag, 0, 0, 0);
  // Twee passages: de eerste schatting kan er bij een zomeruurwissel een uur
  // naast zitten, de tweede corrigeert dat.
  let tijdstip = gok - zoneVerschilMs(new Date(gok), tijdzone);
  tijdstip = gok - zoneVerschilMs(new Date(tijdstip), tijdzone);
  return new Date(tijdstip);
}

function alsDatumTekst(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

function laatsteDagVanMaand(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

export function maandPeriode(jaar: number, maand: number): Periode {
  if (maand < 1 || maand > 12) {
    throw new Error(`Ongeldige maand: ${maand}`);
  }
  const volgendJaar = maand === 12 ? jaar + 1 : jaar;
  const volgendeMaand = maand === 12 ? 1 : maand + 1;

  return {
    soort: "month",
    start: alsDatumTekst(jaar, maand, 1),
    eind: alsDatumTekst(jaar, maand, laatsteDagVanMaand(jaar, maand)),
    vanaf: lokaleDatumNaarUtc(jaar, maand, 1),
    tot: lokaleDatumNaarUtc(volgendJaar, volgendeMaand, 1),
    label: `${MAANDNAMEN[maand - 1]} ${jaar}`,
  };
}

export function kwartaalPeriode(jaar: number, kwartaal: number): Periode {
  if (kwartaal < 1 || kwartaal > 4) {
    throw new Error(`Ongeldig kwartaal: ${kwartaal}`);
  }
  const eersteMaand = (kwartaal - 1) * 3 + 1;
  const laatsteMaand = eersteMaand + 2;
  const volgendJaar = kwartaal === 4 ? jaar + 1 : jaar;
  const volgendeMaand = kwartaal === 4 ? 1 : laatsteMaand + 1;

  return {
    soort: "quarter",
    start: alsDatumTekst(jaar, eersteMaand, 1),
    eind: alsDatumTekst(jaar, laatsteMaand, laatsteDagVanMaand(jaar, laatsteMaand)),
    vanaf: lokaleDatumNaarUtc(jaar, eersteMaand, 1),
    tot: lokaleDatumNaarUtc(volgendJaar, volgendeMaand, 1),
    label: `Q${kwartaal} ${jaar}`,
  };
}

/** In welk kwartaal valt een datum (YYYY-MM-DD of Date)? */
export function kwartaalVan(datum: Date | string, tijdzone: string = TIJDZONE): {
  jaar: number;
  kwartaal: number;
} {
  const { jaar, maand } = lokaleOnderdelen(datum, tijdzone);
  return { jaar, kwartaal: Math.floor((maand - 1) / 3) + 1 };
}

export function lokaleOnderdelen(
  datum: Date | string,
  tijdzone: string = TIJDZONE,
): { jaar: number; maand: number; dag: number } {
  if (typeof datum === "string" && /^\d{4}-\d{2}-\d{2}/.test(datum)) {
    return {
      jaar: Number(datum.slice(0, 4)),
      maand: Number(datum.slice(5, 7)),
      dag: Number(datum.slice(8, 10)),
    };
  }
  const moment = typeof datum === "string" ? new Date(datum) : datum;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tijdzone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const tekst = formatter.format(moment); // YYYY-MM-DD
  return {
    jaar: Number(tekst.slice(0, 4)),
    maand: Number(tekst.slice(5, 7)),
    dag: Number(tekst.slice(8, 10)),
  };
}

/** De periode die net afgelopen is; gebruikt door de automatische taken. */
export function vorigePeriode(soort: PeriodeSoort, nu: Date = new Date()): Periode {
  const { jaar, maand } = lokaleOnderdelen(nu);
  if (soort === "month") {
    return maand === 1 ? maandPeriode(jaar - 1, 12) : maandPeriode(jaar, maand - 1);
  }
  const kwartaal = Math.floor((maand - 1) / 3) + 1;
  return kwartaal === 1 ? kwartaalPeriode(jaar - 1, 4) : kwartaalPeriode(jaar, kwartaal - 1);
}

/** Bouw een periode uit losse vrije datums (begin- en einddag, inclusief). */
export function vrijePeriode(start: string, eind: string): Periode {
  const begin = lokaleOnderdelen(start);
  const einde = lokaleOnderdelen(eind);
  const vanaf = lokaleDatumNaarUtc(begin.jaar, begin.maand, begin.dag);
  const dagNaEinde = new Date(Date.UTC(einde.jaar, einde.maand - 1, einde.dag + 1));
  const tot = lokaleDatumNaarUtc(
    dagNaEinde.getUTCFullYear(),
    dagNaEinde.getUTCMonth() + 1,
    dagNaEinde.getUTCDate(),
  );
  if (tot <= vanaf) {
    throw new Error("De einddatum moet na de begindatum liggen.");
  }
  return {
    soort: "month",
    start,
    eind,
    vanaf,
    tot,
    label: `${start} t.e.m. ${eind}`,
  };
}

const KORTE_MAANDNAMEN = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** Eén regel in de keuzelijst met vooringestelde periodes. */
export interface PeriodeOptie {
  /** Wat het formulier verstuurt, bv. "quarter:2026-3". */
  waarde: string;
  label: string;
  /** Kop waaronder de regel hoort, voor een optgroup. */
  groep: string;
}

/**
 * Zet een keuzewaarde om naar een periode.
 *
 * Geeft null bij alles wat niet herkend wordt, zodat de aanroeper zelf kan
 * beslissen wat er dan moet gebeuren.
 */
export function periodeUitWaarde(waarde: string): Periode | null {
  const treffer = /^(month|quarter):(\d{4})-(\d{1,2})$/.exec(waarde.trim());
  if (!treffer) return null;

  const jaar = Number(treffer[2]);
  const nummer = Number(treffer[3]);
  if (jaar < 2000 || jaar > 2100) return null;

  try {
    return treffer[1] === "quarter" ? kwartaalPeriode(jaar, nummer) : maandPeriode(jaar, nummer);
  } catch {
    return null;
  }
}

/**
 * De vooringestelde periodes, nieuwste eerst.
 *
 * Bewust geen "volgend kwartaal" of "tot vandaag": een rapport gaat over wat
 * er geladen is, en dat is per definitie verleden tijd. Een lopende periode
 * staat er wel bij, want tussentijds kijken is nuttig -- maar dan zegt het
 * label ook dat ze nog loopt.
 */
export function periodeKeuzes(nu: Date = new Date()): PeriodeOptie[] {
  const { jaar, maand } = lokaleOnderdelen(nu);
  const opties: PeriodeOptie[] = [];

  const huidigKwartaal = Math.floor((maand - 1) / 3) + 1;
  for (let terug = 0; terug < 8; terug += 1) {
    const verschoven = huidigKwartaal - 1 - terug;
    const kwartaalJaar = jaar + Math.floor(verschoven / 4);
    const kwartaal = ((verschoven % 4) + 4) % 4 + 1;
    const eerste = (kwartaal - 1) * 3;
    const maanden = `${KORTE_MAANDNAMEN[eerste]}–${KORTE_MAANDNAMEN[eerste + 2]}`;
    const naam = `Q${kwartaal} ${kwartaalJaar} (${maanden})`;

    opties.push({
      waarde: `quarter:${kwartaalJaar}-${kwartaal}`,
      groep: "Kwartaal",
      label:
        terug === 0 ? `Dit kwartaal — ${naam}` : terug === 1 ? `Vorig kwartaal — ${naam}` : naam,
    });
  }

  for (let terug = 0; terug < 12; terug += 1) {
    const verschoven = maand - 1 - terug;
    const maandJaar = jaar + Math.floor(verschoven / 12);
    const nummer = ((verschoven % 12) + 12) % 12 + 1;
    const naam = `${MAANDNAMEN[nummer - 1]} ${maandJaar}`;

    opties.push({
      waarde: `month:${maandJaar}-${nummer}`,
      groep: "Maand",
      label: terug === 0 ? `Deze maand — ${naam}` : terug === 1 ? `Vorige maand — ${naam}` : naam,
    });
  }

  opties.push({ waarde: "vrij", groep: "Anders", label: "Zelf gekozen datums…" });
  return opties;
}
