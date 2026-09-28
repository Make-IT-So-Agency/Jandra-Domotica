/**
 * Wanneer de inschrijvingen voor de buitenschoolse opvang (BKO) in
 * Sint-Katelijne-Waver openen.
 *
 * Bron: "Start inschrijvingsperiodes 2026-2027.pdf" op
 * https://huisvanhetkind.skw.be/inschrijven-bko. Die tabel is de waarheid.
 * De regel die de website noemt, klopt er niet altijd mee ("derde dinsdag"
 * voor de tweede ronde is in werkelijkheid de voorlaatste dinsdag), dus een
 * berekend moment is enkel een voorstel tot de nieuwe tabel er is.
 *
 * - Inwoners en personeel: dinsdag 18:00, 2 maanden voor de opvangmaand
 * - Niet-inwoners: de donderdag erna, 09:00
 * - Tweede ronde, voor iedereen: dinsdag 18:00 in de maand ervoor
 */

import { lokaleDatumNaarUtc } from "@/lib/periods";

export type Ronde = "inwoners" | "niet_inwoners" | "tweede_ronde";

export interface Inschrijfmoment {
  /** De opvangmaand als YYYY-MM, of "zomer-YYYY" voor de zomervakantie. */
  opvang: string;
  ronde: Ronde;
  /** Het moment van opening, als UTC-tijdstip. */
  opent: Date;
  /** Uit de officiële tabel, of zelf berekend met de regel. */
  bron: "tabel" | "berekend";
}

/** [opvang, inwoners, niet-inwoners, tweede ronde], datums in Belgische tijd. */
const TABEL_2026_2027: [string, string, string, string | null][] = [
  ["2026-09", "2026-07-07", "2026-07-09", "2026-08-18"],
  ["2026-10", "2026-08-04", "2026-08-06", "2026-09-22"],
  ["2026-11", "2026-09-01", "2026-09-03", "2026-10-20"],
  ["2026-12", "2026-10-06", "2026-10-08", "2026-11-17"],
  ["2027-01", "2026-11-03", "2026-11-05", "2026-12-22"],
  ["2027-02", "2026-12-01", "2026-12-03", "2027-01-19"],
  ["2027-03", "2027-01-05", "2027-01-07", "2027-02-16"],
  ["2027-04", "2027-02-02", "2027-02-04", "2027-03-23"],
  ["2027-05", "2027-03-02", "2027-03-04", "2027-04-20"],
  ["2027-06", "2027-04-06", "2027-04-08", "2027-05-18"],
  ["zomer-2027", "2027-04-27", "2027-04-29", null],
];

const UUR: Record<Ronde, number> = { inwoners: 18, niet_inwoners: 9, tweede_ronde: 18 };

/** Een Belgische datum en uur als UTC. Opening is nooit op een dag met uurwissel (zondag). */
function belgischMoment(datum: string, uur: number): Date {
  const [j, m, d] = datum.split("-").map(Number);
  return new Date(lokaleDatumNaarUtc(j, m, d).getTime() + uur * 3_600_000);
}

function alsDatum(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

function dinsdagen(jaar: number, maand: number): number[] {
  const dagen: number[] = [];
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  for (let d = 1; d <= laatste; d++) {
    if (new Date(Date.UTC(jaar, maand - 1, d)).getUTCDay() === 2) dagen.push(d);
  }
  return dagen;
}

function maandTerug(jaar: number, maand: number, aantal: number): [number, number] {
  const index = jaar * 12 + (maand - 1) - aantal;
  return [Math.floor(index / 12), (index % 12) + 1];
}

/**
 * De regel, voor een gewone opvangmaand (niet de zomer): eerste dinsdag twee
 * maanden ervoor, donderdag twee dagen later, en de voorlaatste dinsdag van
 * de maand ervoor.
 */
export function berekendeMomenten(jaar: number, maand: number): Record<Ronde, string> {
  const [j1, m1] = maandTerug(jaar, maand, 2);
  const eerste = dinsdagen(j1, m1)[0];
  const [j2, m2] = maandTerug(jaar, maand, 1);
  const di = dinsdagen(j2, m2);
  return {
    inwoners: alsDatum(j1, m1, eerste),
    niet_inwoners: alsDatum(j1, m1, eerste + 2),
    tweede_ronde: alsDatum(j2, m2, di[di.length - 2]),
  };
}

export function alleMomenten(): Inschrijfmoment[] {
  const momenten: Inschrijfmoment[] = [];
  for (const [opvang, inwoners, niet, tweede] of TABEL_2026_2027) {
    const datums: [Ronde, string | null][] = [
      ["inwoners", inwoners],
      ["niet_inwoners", niet],
      ["tweede_ronde", tweede],
    ];
    for (const [ronde, datum] of datums) {
      if (datum) momenten.push({ opvang, ronde, opent: belgischMoment(datum, UUR[ronde]), bron: "tabel" });
    }
  }
  return momenten.sort((a, b) => a.opent.getTime() - b.opent.getTime());
}

/**
 * De eerstvolgende openingen voor een ronde. Voorbij de officiële tabel valt
 * dit terug op de regel, gemarkeerd als "berekend" (zonder zomervakantie:
 * die heeft haar eigen datum).
 */
export function volgendeMomenten(ronde: Ronde, nu: Date = new Date(), aantal = 1): Inschrijfmoment[] {
  const uitTabel = alleMomenten().filter((m) => m.ronde === ronde && m.opent > nu);
  const resultaat = [...uitTabel];

  const laatsteMaand = TABEL_2026_2027.filter(([o]) => !o.startsWith("zomer")).at(-1)![0];
  let [jaar, maand] = laatsteMaand.split("-").map(Number);
  while (resultaat.length < aantal) {
    [jaar, maand] = maand === 12 ? [jaar + 1, 1] : [jaar, maand + 1];
    if (maand === 7 || maand === 8) continue;
    const datum = berekendeMomenten(jaar, maand)[ronde];
    const opent = belgischMoment(datum, UUR[ronde]);
    if (opent > nu) resultaat.push({ opvang: alsDatum(jaar, maand, 1).slice(0, 7), ronde, opent, bron: "berekend" });
  }
  return resultaat.slice(0, aantal);
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function opvangLabel(opvang: string): string {
  if (opvang.startsWith("zomer-")) return `zomervakantie ${opvang.slice(6)}`;
  const [jaar, maand] = opvang.split("-").map(Number);
  return `${MAANDEN[maand - 1]} ${jaar}`;
}

export function momentLabel(moment: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(moment);
}
