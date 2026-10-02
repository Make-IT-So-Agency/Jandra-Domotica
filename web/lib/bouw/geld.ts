import { dagenTekst, dagenTussen, korteDatum, plusDagen } from "./kalender";

/**
 * Het geld van de bouw: per post de raming, de gekozen offerte, de meer- en
 * minwerken, wat gefactureerd en betaald is; de facturen met hun vervaldag;
 * het bouwkrediet; en een kasplanning per maand. Puur. Alle bedragen zijn
 * inclusief btw.
 *
 * De lijsten horen bij supabase/migrations/20261002202506_bouw_geld.sql.
 */

export const CATEGORIEEN_POST = ["werken", "studies", "vergunning", "nutsvoorzieningen", "inrichting", "andere"] as const;
export type CategoriePost = (typeof CATEGORIEEN_POST)[number];

export const CATEGORIENAMEN_POST: Record<CategoriePost, string> = {
  werken: "Werken",
  studies: "Studies en adviezen",
  vergunning: "Vergunning en taksen",
  nutsvoorzieningen: "Aansluitingen",
  inrichting: "Inrichting",
  andere: "Andere",
};

export function isCategoriePost(waarde: string): waarde is CategoriePost {
  return (CATEGORIEEN_POST as readonly string[]).includes(waarde);
}

export const STATUSSEN_OFFERTE = ["ontvangen", "gekozen", "afgewezen"] as const;
export type StatusOfferte = (typeof STATUSSEN_OFFERTE)[number];
export const STATUSSEN_MEERWERK = ["voorgesteld", "aanvaard", "geweigerd"] as const;
export type StatusMeerwerk = (typeof STATUSSEN_MEERWERK)[number];

export function isStatusMeerwerk(waarde: string): waarde is StatusMeerwerk {
  return (STATUSSEN_MEERWERK as readonly string[]).includes(waarde);
}

export interface Post {
  id: number;
  naam: string;
  categorie: CategoriePost;
  raming: number | null;
  partij_id: number | null;
  planning_id: number | null;
  opmerking: string | null;
}

export interface Offerte {
  id: number;
  post_id: number;
  partij_id: number | null;
  omschrijving: string | null;
  bedrag: number;
  datum: string | null;
  geldig_tot: string | null;
  bestand_id: number | null;
  status: StatusOfferte;
  opmerking: string | null;
}

export interface Meerwerk {
  id: number;
  post_id: number;
  omschrijving: string;
  bedrag: number;
  datum: string;
  status: StatusMeerwerk;
}

export interface Factuur {
  id: number;
  post_id: number | null;
  partij_id: number | null;
  nummer: string | null;
  omschrijving: string | null;
  bedrag: number;
  factuurdatum: string;
  vervaldag: string | null;
  betaald_op: string | null;
  bestand_id: number | null;
  vennootschap_id: string | null;
  opmerking: string | null;
}

export interface Kredietopname {
  id: number;
  datum: string;
  bedrag: number;
  factuur_id: number | null;
  opmerking: string | null;
}

const rond2 = (waarde: number) => Math.round(waarde * 100) / 100;
const som = (waarden: number[]) => rond2(waarden.reduce((totaal, waarde) => totaal + waarde, 0));

export interface Poststand {
  post: Post;
  gekozen: Offerte | null;
  /** De aanvaarde meer- en minwerken samen. */
  meerwerk: number;
  /** De gekozen offerte met de meerwerken, of null zolang er niets gekozen is. */
  toegekend: number | null;
  /** Wat we verwachten te betalen: toegekend, anders de raming met de meerwerken. */
  verwacht: number;
  gefactureerd: number;
  betaald: number;
  /** Gefactureerd maar nog niet betaald. */
  open: number;
  /** Wat er nog gefactureerd moet worden, volgens de verwachting. */
  nogTeFactureren: number;
  /** Toegekend min raming: positief is duurder dan geraamd. */
  afwijking: number | null;
}

export function poststanden(
  posten: readonly Post[],
  offertes: readonly Offerte[],
  meerwerken: readonly Meerwerk[],
  facturen: readonly Factuur[],
): Poststand[] {
  return posten.map((post) => {
    const gekozen = offertes.find((offerte) => offerte.post_id === post.id && offerte.status === "gekozen") ?? null;
    const meerwerk = som(meerwerken.filter((m) => m.post_id === post.id && m.status === "aanvaard").map((m) => m.bedrag));
    const toegekend = gekozen ? rond2(gekozen.bedrag + meerwerk) : null;
    const eigen = facturen.filter((factuur) => factuur.post_id === post.id);
    const gefactureerd = som(eigen.map((f) => f.bedrag));
    const betaald = som(eigen.filter((f) => f.betaald_op).map((f) => f.bedrag));
    const verwacht = toegekend ?? rond2((post.raming ?? 0) + meerwerk);
    return {
      post,
      gekozen,
      meerwerk,
      toegekend,
      verwacht: Math.max(verwacht, gefactureerd),
      gefactureerd,
      betaald,
      open: rond2(gefactureerd - betaald),
      nogTeFactureren: Math.max(0, rond2(verwacht - gefactureerd)),
      afwijking: toegekend !== null && post.raming !== null ? rond2(toegekend - post.raming) : null,
    };
  });
}

export interface Geldtotaal {
  raming: number;
  verwacht: number;
  gefactureerd: number;
  betaald: number;
  open: number;
  nogTeFactureren: number;
}

/** Alles samen, ook de facturen die bij geen post horen. */
export function totalen(standen: readonly Poststand[], facturen: readonly Factuur[]): Geldtotaal {
  const los = facturen.filter((f) => f.post_id === null || !standen.some((s) => s.post.id === f.post_id));
  const losGefactureerd = som(los.map((f) => f.bedrag));
  const losBetaald = som(los.filter((f) => f.betaald_op).map((f) => f.bedrag));
  return {
    raming: som(standen.map((s) => s.post.raming ?? 0)),
    verwacht: rond2(som(standen.map((s) => s.verwacht)) + losGefactureerd),
    gefactureerd: rond2(som(standen.map((s) => s.gefactureerd)) + losGefactureerd),
    betaald: rond2(som(standen.map((s) => s.betaald)) + losBetaald),
    open: rond2(som(standen.map((s) => s.open)) + losGefactureerd - losBetaald),
    nogTeFactureren: som(standen.map((s) => s.nogTeFactureren)),
  };
}

/** Zonder vervaldag rekenen we 30 dagen na de factuurdatum, zoals gebruikelijk. */
export function vervaldagVan(factuur: Pick<Factuur, "factuurdatum" | "vervaldag">): string {
  return factuur.vervaldag ?? plusDagen(factuur.factuurdatum, 30);
}

export type Factuurstand = "betaald" | "te_laat" | "binnenkort" | "open";

export function factuurstand(factuur: Pick<Factuur, "factuurdatum" | "vervaldag" | "betaald_op">, vandaag: string): Factuurstand {
  if (factuur.betaald_op) return "betaald";
  const dagen = dagenTussen(vandaag, vervaldagVan(factuur));
  if (dagen < 0) return "te_laat";
  if (dagen <= 7) return "binnenkort";
  return "open";
}

export interface Kredietstand {
  krediet: number | null;
  opgenomen: number;
  beschikbaar: number | null;
  eigenInbreng: number | null;
  /** Wat er betaald is zonder krediet, dus uit eigen middelen. */
  eigenBetaald: number;
}

export function kredietstand(
  opnames: readonly Pick<Kredietopname, "bedrag">[],
  facturen: readonly Pick<Factuur, "bedrag" | "betaald_op">[],
  krediet: number | null,
  eigenInbreng: number | null,
): Kredietstand {
  const opgenomen = som(opnames.map((o) => o.bedrag));
  const betaald = som(facturen.filter((f) => f.betaald_op).map((f) => f.bedrag));
  return {
    krediet,
    opgenomen,
    beschikbaar: krediet === null ? null : rond2(krediet - opgenomen),
    eigenInbreng,
    eigenBetaald: Math.max(0, rond2(betaald - opgenomen)),
  };
}

export interface Kasmaand {
  /** YYYY-MM */
  maand: string;
  betaald: number;
  /** Facturen die deze maand vervallen; wat al vervallen is, staat bij de huidige maand. */
  teBetalen: number;
  /** Wat nog gefactureerd moet worden, gespreid over de maanden van de taak in de planning. */
  gepland: number;
  /** Alles tot en met deze maand. */
  cumulatief: number;
  /** Hoeveel daarvan het krediet moet dragen, als eerst de eigen inbreng opgaat. */
  uitKrediet: number;
}

const maandVan = (datum: string) => datum.slice(0, 7);

function volgendeMaand(maand: string): string {
  const [jaar, m] = maand.split("-").map(Number);
  return m === 12 ? `${jaar + 1}-01` : `${jaar}-${String(m + 1).padStart(2, "0")}`;
}

function maandenTussen(van: string, tot: string): string[] {
  const uit: string[] = [];
  for (let maand = van; maand <= tot && uit.length < 240; maand = volgendeMaand(maand)) uit.push(maand);
  return uit;
}

/**
 * Een kasplanning per maand: wat betaald is, wat vervalt, en wat nog komt
 * volgens de planning. Een post zonder taak in de planning komt bij
 * `ongepland`: daar weten we niet wanneer.
 */
export function kasplanning(
  standen: readonly Poststand[],
  facturen: readonly Factuur[],
  planning: readonly { id: number; begindatum: string; einddatum: string | null }[],
  vandaag: string,
  eigenInbreng: number | null,
): { maanden: Kasmaand[]; ongepland: number } {
  const nu = maandVan(vandaag);
  const per = new Map<string, { betaald: number; teBetalen: number; gepland: number }>();
  const bij = (maand: string) => {
    let rij = per.get(maand);
    if (!rij) {
      rij = { betaald: 0, teBetalen: 0, gepland: 0 };
      per.set(maand, rij);
    }
    return rij;
  };

  for (const factuur of facturen) {
    if (factuur.betaald_op) bij(maandVan(factuur.betaald_op)).betaald += factuur.bedrag;
    else {
      const vervalt = maandVan(vervaldagVan(factuur));
      bij(vervalt < nu ? nu : vervalt).teBetalen += factuur.bedrag;
    }
  }

  let ongepland = 0;
  for (const stand of standen) {
    if (stand.nogTeFactureren <= 0) continue;
    const taak = planning.find((item) => item.id === stand.post.planning_id);
    if (!taak) {
      ongepland += stand.nogTeFactureren;
      continue;
    }
    const van = maandVan(taak.begindatum) < nu ? nu : maandVan(taak.begindatum);
    const tot = maandVan(taak.einddatum ?? taak.begindatum) < van ? van : maandVan(taak.einddatum ?? taak.begindatum);
    const maanden = maandenTussen(van, tot);
    for (const maand of maanden) bij(maand).gepland += stand.nogTeFactureren / maanden.length;
  }

  const sleutels = [...per.keys()].sort();
  if (sleutels.length === 0) return { maanden: [], ongepland: rond2(ongepland) };
  let cumulatief = 0;
  const eigen = eigenInbreng ?? 0;
  const maanden = maandenTussen(sleutels[0], sleutels.at(-1)!).map((maand) => {
    const rij = per.get(maand) ?? { betaald: 0, teBetalen: 0, gepland: 0 };
    const voor = cumulatief;
    cumulatief += rij.betaald + rij.teBetalen + rij.gepland;
    return {
      maand,
      betaald: rond2(rij.betaald),
      teBetalen: rond2(rij.teBetalen),
      gepland: rond2(rij.gepland),
      cumulatief: rond2(cumulatief),
      uitKrediet: rond2(Math.max(0, cumulatief - eigen) - Math.max(0, voor - eigen)),
    };
  });
  return { maanden, ongepland: rond2(ongepland) };
}

const euroFormatter = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "€ 12.345,60" */
export function euroBedrag(bedrag: number): string {
  return euroFormatter.format(bedrag);
}

export interface Factuurherinnering {
  sleutel: string;
  tekst: string;
  pad: string;
}

/** Herinneren 3 dagen vóór de vervaldag, op de dag zelf, en één keer de dag erna. */
export const FACTUUR_HERINNEREN_OP = [3, 0, -1];

/** "factuur 2026-031 van Architect (€ 2.420,00)", of "een factuur (€ 120,00)". */
export function factuurWat(factuur: Pick<Factuur, "nummer" | "bedrag">, wie: string | null): string {
  return `${factuur.nummer ? `factuur ${factuur.nummer}` : "een factuur"}${wie ? ` van ${wie}` : ""} (${euroBedrag(factuur.bedrag)})`;
}

export const hoofdletter = (tekst: string) => tekst.charAt(0).toLocaleUpperCase("nl-BE") + tekst.slice(1);

export interface Openfactuur {
  factuur: Factuur;
  vervaldag: string;
  /** Dagen tot de vervaldag; negatief is te laat. */
  dagen: number;
}

/** De facturen die nog betaald moeten worden, de eerste vervaldag eerst. Een creditnota hoort daar niet bij. */
export function openFacturen(facturen: readonly Factuur[], vandaag: string): Openfactuur[] {
  return facturen
    .filter((factuur) => !factuur.betaald_op && factuur.bedrag > 0)
    .map((factuur) => {
      const vervaldag = vervaldagVan(factuur);
      return { factuur, vervaldag, dagen: dagenTussen(vandaag, vervaldag) };
    })
    .sort((a, b) => a.vervaldag.localeCompare(b.vervaldag) || a.factuur.id - b.factuur.id);
}

export function factuurherinneringen(
  facturen: readonly Factuur[],
  partijnaam: (partijId: number | null) => string | null,
  vandaag: string,
): Factuurherinnering[] {
  const uit: Factuurherinnering[] = [];
  for (const { factuur, vervaldag: vervalt, dagen } of openFacturen(facturen, vandaag)) {
    if (!FACTUUR_HERINNEREN_OP.includes(dagen)) continue;
    const wat = factuurWat(factuur, partijnaam(factuur.partij_id));
    uit.push({
      sleutel: `factuur:${factuur.id}:${vervalt}:${dagen}`,
      tekst:
        dagen < 0
          ? `⚠️ ${hoofdletter(wat)} was gisteren te betalen (${korteDatum(vervalt, vandaag)}).`
          : `💶 ${hoofdletter(wat)}: betalen ${dagenTekst(dagen)}${dagen > 0 ? ` (tegen ${korteDatum(vervalt, vandaag)})` : ""}.`,
      pad: "/bouw/geld/facturen",
    });
  }
  return uit;
}

export interface Offertevergelijking {
  /** Hoeveel duurder dan de goedkoopste offerte van dezelfde post: 0 voor de goedkoopste zelf. */
  tovGoedkoopste: number;
  /** Het verschil met de raming, in procent; null zonder raming. */
  tovRaming: number | null;
}

/** Offertes van één post naast elkaar: tegenover de goedkoopste en tegenover de raming. */
export function vergelijkOffertes(offertes: readonly Offerte[], raming: number | null): Map<number, Offertevergelijking> {
  const goedkoopste = offertes.length === 0 ? 0 : Math.min(...offertes.map((offerte) => offerte.bedrag));
  return new Map(
    offertes.map((offerte) => [
      offerte.id,
      {
        tovGoedkoopste: rond2(offerte.bedrag - goedkoopste),
        tovRaming: raming ? Math.round(((offerte.bedrag - raming) / raming) * 1000) / 10 : null,
      },
    ]),
  );
}

/** Een bedrag uit bouw_instellingen, bv. het krediet. Leeg of onzin is null. */
export function bedragUitInstelling(waarde: string | null | undefined): number | null {
  if (waarde === null || waarde === undefined || waarde.trim() === "") return null;
  const getal = Number(waarde);
  return Number.isFinite(getal) && getal >= 0 ? getal : null;
}

export interface Standaardpost {
  naam: string;
  categorie: CategoriePost;
}

/** De gewone posten van een nieuwbouw met losse aannemers, om mee te beginnen. */
export const STANDAARDPOSTEN: readonly Standaardpost[] = [
  { naam: "Architect", categorie: "studies" },
  { naam: "Stabiliteitsingenieur", categorie: "studies" },
  { naam: "EPB-verslaggever", categorie: "studies" },
  { naam: "Veiligheidscoördinator", categorie: "studies" },
  { naam: "Bodem- en grondonderzoek", categorie: "studies" },
  { naam: "Omgevingsvergunning en taksen", categorie: "vergunning" },
  { naam: "Ruwbouw", categorie: "werken" },
  { naam: "Dakwerken", categorie: "werken" },
  { naam: "Buitenschrijnwerk", categorie: "werken" },
  { naam: "Elektriciteit", categorie: "werken" },
  { naam: "Sanitair en verwarming", categorie: "werken" },
  { naam: "Ventilatie", categorie: "werken" },
  { naam: "Pleisterwerk", categorie: "werken" },
  { naam: "Chape en isolatie", categorie: "werken" },
  { naam: "Vloeren en tegels", categorie: "werken" },
  { naam: "Binnenschrijnwerk en trap", categorie: "werken" },
  { naam: "Keuken", categorie: "inrichting" },
  { naam: "Schilderwerk", categorie: "werken" },
  { naam: "Buitenaanleg", categorie: "werken" },
  { naam: "Water, elektriciteit en riolering aansluiten", categorie: "nutsvoorzieningen" },
];

/** Een ronde bovengrens voor een grafiek: 1, 2, 2,5 of 5 maal een macht van tien. */
export function mooieGrens(waarde: number): number {
  if (!(waarde > 0)) return 1;
  const macht = 10 ** Math.floor(Math.log10(waarde));
  const stap = [1, 2, 2.5, 5, 10].find((factor) => factor * macht >= waarde * (1 - 1e-9))!;
  return stap * macht;
}

/** "25k", "1,5k", "800": voor de as van een grafiek. */
export function kortBedrag(bedrag: number): string {
  if (Math.abs(bedrag) >= 1000) return `${(bedrag / 1000).toLocaleString("nl-BE", { maximumFractionDigits: 1 })}k`;
  return Math.round(bedrag).toLocaleString("nl-BE");
}

/**
 * Bij welke post een ingestuurde offerte of factuur waarschijnlijk hoort: de
 * post waarvoor we die partij kozen, of de enige post van die partij. Anders
 * niets: dan kiezen we zelf.
 */
export function postVoorstel(
  partijId: number | null,
  soort: "offerte" | "factuur",
  posten: readonly Post[],
  offertes: readonly Offerte[],
): number | null {
  if (partijId === null) return null;
  if (soort === "factuur") {
    const gekozen = [...new Set(offertes.filter((o) => o.status === "gekozen" && o.partij_id === partijId).map((o) => o.post_id))];
    if (gekozen.length === 1) return gekozen[0];
  }
  const eigen = posten.filter((post) => post.partij_id === partijId);
  return eigen.length === 1 ? eigen[0].id : null;
}
