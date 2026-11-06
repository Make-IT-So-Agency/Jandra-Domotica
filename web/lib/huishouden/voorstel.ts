import {
  PERSONEN,
  PERSOONSNAMEN,
  UREN_PER_SCORE,
  actieveKaarten,
  isScore,
  zelfdeVersie,
  type Beslissing,
  type Lijstakkoord,
  type Ronde,
  type Claim,
  type Invoer,
  type Kaart,
  type Persoon,
} from "./balans";

/**
 * Het voorstel van De balans (stap 4) en de weegschaal: wie welke kaart
 * krijgt, waarom, en hoeveel uren en mentale last dat voor elk betekent.
 * Puur, zodat elke regel uit de overdracht (§6, R1 tot R13) apart te testen
 * valt (zie tests/huishouden-voorstel.test.ts).
 */

/** Waar een kaart terechtkomt. */
export type Eigenaar = Persoon | "uitbesteed" | "samen" | "elk";

/** Waar je een kaart in het voorstel naartoe kan verschuiven. */
export const VERSCHUIVINGEN = ["jan", "sandra", "uitbesteed"] as const;
export type Verschuiving = (typeof VERSCHUIVINGEN)[number];

export function isVerschuiving(waarde: unknown): waarde is Verschuiving {
  return (VERSCHUIVINGEN as readonly unknown[]).includes(waarde);
}

/** Welke regel een kaart haar eigenaar gaf. */
export type Regel = "R1" | "R2" | "R2b" | "R3" | "R4" | "R5" | "R5b" | "leeg" | "vast" | "elk" | "samen";

/** Kaarten die niemand graag doet, tellen anderhalve keer (R8). */
export const COMPENSATIE = 1.5;

/** Een verschil in bod van zoveel punten of minder is nipt (R19). */
export const NIPT = 10;

/** Hoe graag jullie een kaart willen als jullie er allebei "Wil ik" op zetten (stap 3). */
export type Bod = Record<Persoon, number>;

export interface Voorstelkaart {
  kaart: Kaart;
  /** Waar ze nu staat, met verschuivingen. */
  eigenaar: Eigenaar;
  /** Waar het voorstel ze zette, zonder verschuivingen. */
  voorgesteld: Eigenaar;
  regel: Regel;
  /** De reden zoals ze op de kaart staat, of null. */
  reden: string | null;
  nipt: boolean;
  /** Uren per week (R7). */
  uren: number;
  /** Uren zoals ze tellen: ×1,5 als niemand de kaart graag doet (R8). */
  gewogen: number;
  compensatie: boolean;
  /** Mentale last (R9). */
  mentaal: number;
  verschoven: boolean;
}

export interface Lading {
  /** Gewogen uren per week, met hobbytijd. */
  uren: number;
  mentaal: number;
  beschikbaar: number | null;
}

export interface Voorstel {
  kaarten: Voorstelkaart[];
  totaal: Record<Persoon, Lading>;
  /** Kaarten die vanzelf een thuis vonden: R1 en R3. */
  vanzelf: number;
  verschoven: number;
}

export interface Voorstelinvoer {
  kaarten: Kaart[];
  invoer: Record<Persoon, ReadonlyMap<number, Invoer>>;
  beschikbareTijd: Record<Persoon, number | null>;
  /** Biedingen per kaart, enkel bij kaarten waar jullie allebei "Wil ik" claimen. */
  biedingen?: ReadonlyMap<number, Bod>;
  /** Wat jullie samen verschoven, of in stap 5 wat vastgelegd werd. */
  verschuivingen?: ReadonlyMap<number, Verschuiving>;
}

const gemiddelde = (getallen: number[]) =>
  getallen.length === 0 ? 0 : getallen.reduce((som, getal) => som + getal, 0) / getallen.length;

/** Uren van een kaart: het gemiddelde van de omgezette scores van wie invulde (R7), of de vaste uren. */
export function urenVan(kaart: Pick<Kaart, "id" | "vasteUren">, invoer: Voorstelinvoer["invoer"]): number {
  if (kaart.vasteUren !== null) return kaart.vasteUren;
  return gemiddelde(
    PERSONEN.map((persoon) => invoer[persoon].get(kaart.id)?.tijd ?? null)
      .filter(isScore)
      .map((score) => UREN_PER_SCORE[score]),
  );
}

/** Mentale last van een kaart: het gemiddelde van de ingevulde scores, nooit in uren (R9). */
export function mentaalVan(kaart: Pick<Kaart, "id">, invoer: Voorstelinvoer["invoer"]): number {
  return gemiddelde(PERSONEN.map((persoon) => invoer[persoon].get(kaart.id)?.last ?? null).filter(isScore));
}

const NEGATIEF: readonly Claim[] = ["liever_niet", "echt_niet"];

/** Niemand doet ze graag: allebei "liever niet" of "echt niet" (R8). */
export function niemandGraag(jan: Claim | null, sandra: Claim | null): boolean {
  return jan !== null && sandra !== null && NEGATIEF.includes(jan) && NEGATIEF.includes(sandra);
}

interface Toewijzing {
  naar: Persoon | "evenwicht";
  regel: Regel;
  reden: (naar: Persoon) => string;
  nipt: boolean;
}

/** De eerste regel die past (R1 tot R5b), voor een kaart via het spel. */
export function toewijzing(jan: Claim | null, sandra: Claim | null, bod?: Bod): Toewijzing {
  const claims: Record<Persoon, Claim | null> = { jan, sandra };
  const wie = (claim: Claim) => PERSONEN.filter((persoon) => claims[persoon] === claim);

  if (jan === null || sandra === null) {
    return { naar: "evenwicht", regel: "leeg", reden: () => "Nog niet ingevuld, voor het evenwicht", nipt: true };
  }

  const willen = wie("wil");
  if (willen.length === 1) {
    return { naar: willen[0], regel: "R1", reden: (naar) => `${PERSOONSNAMEN[naar]} doet dit graag`, nipt: false };
  }
  if (willen.length === 2) {
    if (bod && bod.jan !== bod.sandra) {
      const naar: Persoon = bod.jan > bod.sandra ? "jan" : "sandra";
      const [hoog, laag] = naar === "jan" ? [bod.jan, bod.sandra] : [bod.sandra, bod.jan];
      return {
        naar,
        regel: "R2",
        reden: (persoon) => `${PERSOONSNAMEN[persoon]} wou dit het liefst (${hoog} tegen ${laag})`,
        nipt: hoog - laag <= NIPT,
      };
    }
    return {
      naar: "evenwicht",
      regel: "R2b",
      reden: () => "Jullie willen dit allebei graag, voor het evenwicht",
      nipt: true,
    };
  }

  const mogen = wie("mag");
  if (mogen.length === 1) {
    // De ander zegt dan "liever niet" of "echt niet": "wil" viel al weg.
    return { naar: mogen[0], regel: "R3", reden: (naar) => `Mag voor ${PERSOONSNAMEN[naar]}`, nipt: false };
  }
  if (mogen.length === 2) {
    return { naar: "evenwicht", regel: "R5b", reden: () => "Mag voor allebei, voor het evenwicht", nipt: true };
  }

  // Allebei negatief.
  if (jan !== sandra) {
    const naar = wie("liever_niet")[0];
    return {
      naar,
      regel: "R4",
      reden: (persoon) => `Valt ${PERSOONSNAMEN[persoon]} minder zwaar, telt 1,5 keer`,
      nipt: true,
    };
  }
  return { naar: "evenwicht", regel: "R5", reden: () => "Niemand doet dit graag, telt 1,5 keer", nipt: true };
}

/**
 * Het voorstel. Elke actieve kaart via het spel krijgt een eigenaar volgens
 * de eerste regel die past; wat naar het evenwicht gaat, verdeelt R6 van
 * zwaar naar licht, telkens naar wie er daarna relatief het minst draagt.
 * Verschuivingen komen daar bovenop.
 */
export function berekenVoorstel({ kaarten, invoer, beschikbareTijd, biedingen, verschuivingen }: Voorstelinvoer): Voorstel {
  const lijst: Voorstelkaart[] = [];
  const evenwicht: { item: Voorstelkaart; toewijzing: Toewijzing }[] = [];

  for (const kaart of actieveKaarten(kaarten)) {
    const uren = urenVan(kaart, invoer);
    const mentaal = kaart.verdeling === "elk" ? 0 : mentaalVan(kaart, invoer);
    const basis = { kaart, uren, gewogen: uren, compensatie: false, mentaal, nipt: false, reden: null, verschoven: false };

    if (kaart.verdeling === "jan" || kaart.verdeling === "sandra") {
      lijst.push({ ...basis, eigenaar: kaart.verdeling, voorgesteld: kaart.verdeling, regel: "vast" });
      continue;
    }
    if (kaart.verdeling === "elk" || kaart.verdeling === "samen") {
      const eigenaar = kaart.verdeling;
      lijst.push({ ...basis, mentaal: 0, eigenaar, voorgesteld: eigenaar, regel: eigenaar });
      continue;
    }

    const claimJan = invoer.jan.get(kaart.id)?.claim ?? null;
    const claimSandra = invoer.sandra.get(kaart.id)?.claim ?? null;
    const compensatie = niemandGraag(claimJan, claimSandra);
    const gewogen = compensatie ? uren * COMPENSATIE : uren;
    const regels = toewijzing(claimJan, claimSandra, biedingen?.get(kaart.id));
    const item: Voorstelkaart = {
      ...basis,
      gewogen,
      compensatie,
      nipt: regels.nipt,
      regel: regels.regel,
      eigenaar: "jan",
      voorgesteld: "jan",
    };
    lijst.push(item);
    if (regels.naar === "evenwicht") {
      evenwicht.push({ item, toewijzing: regels });
    } else {
      item.eigenaar = item.voorgesteld = regels.naar;
      item.reden = regels.reden(regels.naar);
    }
  }

  // R6: wat iedereen al draagt (vast, hobbytijd en wat al toegewezen is) ...
  const lading: Record<Persoon, number> = { jan: 0, sandra: 0 };
  for (const item of lijst) {
    if (item.regel === "elk") {
      lading.jan += item.gewogen;
      lading.sandra += item.gewogen;
    } else if ((item.eigenaar === "jan" || item.eigenaar === "sandra") && !evenwicht.some((e) => e.item === item)) {
      lading[item.eigenaar] += item.gewogen;
    }
  }

  // ... en dan de rest van zwaar naar licht, naar wie er relatief het minst
  // draagt. Een ontbrekende beschikbare tijd telt als 1 uur. Bij een gelijke
  // stand wisselen jullie af, te beginnen bij Jan (OV16).
  const beschikbaar = (persoon: Persoon) => beschikbareTijd[persoon] ?? 1;
  let gelijkeStand: Persoon = "jan";
  const volgorde = [...evenwicht].sort(
    (a, b) => b.item.gewogen - a.item.gewogen || a.item.kaart.volgorde - b.item.kaart.volgorde || a.item.kaart.id - b.item.kaart.id,
  );
  for (const { item, toewijzing: regels } of volgorde) {
    const verhouding = (persoon: Persoon) => (lading[persoon] + item.gewogen) / beschikbaar(persoon);
    const [jan, sandra] = [verhouding("jan"), verhouding("sandra")];
    let naar: Persoon;
    if (Math.abs(jan - sandra) < 1e-9) {
      naar = gelijkeStand;
      gelijkeStand = gelijkeStand === "jan" ? "sandra" : "jan";
    } else {
      naar = jan < sandra ? "jan" : "sandra";
    }
    lading[naar] += item.gewogen;
    item.eigenaar = item.voorgesteld = naar;
    item.reden = regels.reden(naar);
  }

  // Verschuivingen, enkel voor kaarten via het spel.
  let verschoven = 0;
  for (const item of lijst) {
    const naar = verschuivingen?.get(item.kaart.id);
    if (item.kaart.verdeling !== "spel" || !naar || naar === item.voorgesteld) continue;
    item.eigenaar = naar;
    item.verschoven = true;
    verschoven += 1;
  }

  return {
    kaarten: lijst,
    totaal: {
      jan: ladingVan("jan", lijst, beschikbareTijd.jan),
      sandra: ladingVan("sandra", lijst, beschikbareTijd.sandra),
    },
    vanzelf: lijst.filter((item) => item.regel === "R1" || item.regel === "R3").length,
    verschoven,
  };
}

/** De totalen van één persoon (R10): eigen kaarten, plus hobbytijd zonder mentale last. Uitbesteed en samen tellen niet. */
function ladingVan(persoon: Persoon, lijst: Voorstelkaart[], beschikbaar: number | null): Lading {
  let uren = 0;
  let mentaal = 0;
  for (const item of lijst) {
    if (item.eigenaar === "elk") uren += item.gewogen;
    if (item.eigenaar === persoon) {
      uren += item.gewogen;
      mentaal += item.mentaal;
    }
  }
  return { uren, mentaal, beschikbaar };
}

/** Op een half uur, met een komma: 24,875 wordt "25", 3,25 wordt "3,5" (R11). */
export function halfJes(getal: number): string {
  return String(Math.round(getal * 2) / 2).replace(".", ",");
}

/** "~25 u" (R11). */
export function urenTekst(uren: number): string {
  return `~${halfJes(uren)} u`;
}

/** Meer dan je beschikbare tijd: strikt groter (R13). */
export function overschreden(lading: Lading): boolean {
  return lading.beschikbaar !== null && lading.uren > lading.beschikbaar;
}

/** Hoe vol de balk staat, in procent, hoogstens 100 (R13d). */
export function vulling(lading: Lading): number {
  if (!lading.beschikbaar) return 0;
  return Math.min(100, (lading.uren / lading.beschikbaar) * 100);
}

/** Kaarten die je kan uitbesteden: die niemand graag doet. */
export function magUitbesteden(item: Pick<Voorstelkaart, "compensatie" | "kaart">): boolean {
  return item.kaart.verdeling === "spel" && item.compensatie;
}

// --- "Dit voelt goed voor mij" en vastleggen --------------------------------

/**
 * Wie zich goed voelt bij het voorstel zoals het nu is. Elke verschuiving, en
 * elke gewijzigde claim of inschatting, zet een nieuwe versie: dan telt het
 * akkoord van allebei niet meer (R15, OV11).
 */
export function voeltGoed(ronde: Pick<Ronde, "voorstelVersie">, akkoorden: Lijstakkoord[]): Record<Persoon, boolean> {
  const geldig = (persoon: Persoon) =>
    akkoorden.some((akkoord) => akkoord.persoon === persoon && zelfdeVersie(akkoord.versie, ronde.voorstelVersie));
  return { jan: geldig("jan"), sandra: geldig("sandra") };
}

export function magVoeltGoedGeven(ronde: Pick<Ronde, "fase" | "voorstelVersie">, gezieneVersie: string): Beslissing {
  if (ronde.fase !== "voorstel") return { ok: false, reden: "Het voorstel ligt al vast." };
  if (!zelfdeVersie(gezieneVersie, ronde.voorstelVersie)) {
    return { ok: false, reden: "Het voorstel is net gewijzigd. Kijk het nog even na." };
  }
  return { ok: true };
}

export function magVastleggen(ronde: Pick<Ronde, "fase" | "voorstelVersie">, akkoorden: Lijstakkoord[]): Beslissing {
  if (ronde.fase !== "voorstel") return { ok: false, reden: "Het voorstel ligt al vast." };
  const akkoord = voeltGoed(ronde, akkoorden);
  if (!akkoord.jan || !akkoord.sandra) {
    return { ok: false, reden: "Jullie moeten je er allebei goed bij voelen." };
  }
  return { ok: true };
}

/** Wat er vastgelegd wordt: de eigenaar van elke kaart via het spel. Vaste kaarten staan op de kaart zelf. */
export function teVerdelen(voorstel: Voorstel): { kaartId: number; eigenaar: Verschuiving }[] {
  return voorstel.kaarten
    .filter((item) => item.kaart.verdeling === "spel" && isVerschuiving(item.eigenaar))
    .map((item) => ({ kaartId: item.kaart.id, eigenaar: item.eigenaar as Verschuiving }));
}

/**
 * Wat de pagina in stap 4 en 5 meekrijgt. Vanaf het voorstel zijn de keuzes
 * van allebei zichtbaar, als reden bij een kaart.
 */
export interface Voorstelgegevens {
  voorstel: Voorstel;
  voeltGoed: Record<Persoon, boolean>;
  /** In stap 5: welke kaarten tijdelijk bij de ander liggen. */
  uitleningen: Record<number, Persoon>;
}
