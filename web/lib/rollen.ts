/**
 * Wie mag wat. Bewust zonder databank of sessie erin, zodat elke regel apart
 * te testen valt (zie tests/rollen.test.ts).
 *
 * Drie rollen:
 *
 * - hoofdbeheerder          ziet en beheert alles, over de vennootschappen
 *                           heen, en maakt de rapporten
 * - vennootschapsbeheerder  ziet enkel de eigen vennootschap en nodigt daar
 *                           zelf mensen voor uit
 * - kijker                  ziet enkel de eigen vennootschap, wijzigt niets
 */

export const ROLLEN = ["hoofdbeheerder", "vennootschapsbeheerder", "kijker"] as const;

export type Rol = (typeof ROLLEN)[number];

export const ROLNAMEN: Record<Rol, string> = {
  hoofdbeheerder: "Hoofdbeheerder",
  vennootschapsbeheerder: "Beheerder van de vennootschap",
  kijker: "Kijker",
};

export const ROLUITLEG: Record<Rol, string> = {
  hoofdbeheerder:
    "Ziet alle vennootschappen, beheert laadpalen, tarieven en instellingen, en maakt de rapporten.",
  vennootschapsbeheerder:
    "Ziet enkel de eigen vennootschap en kan daar zelf mensen voor uitnodigen.",
  kijker: "Ziet enkel de rapporten en sessies van de eigen vennootschap.",
};

export interface Gebruiker {
  id: string;
  email: string;
  naam: string | null;
  rol: Rol;
  vennootschap_id: string | null;
  /**
   * Het adres staat in TOEGELATEN_EMAILS en is daardoor altijd
   * hoofdbeheerder. Zo kan je jezelf nooit buitensluiten via de app.
   */
  vasteBeheerder: boolean;
}

export interface Beslissing {
  toegestaan: boolean;
  reden?: string;
}

const JA: Beslissing = { toegestaan: true };

function nee(reden: string): Beslissing {
  return { toegestaan: false, reden };
}

export function isGeldigeRol(waarde: string): waarde is Rol {
  return (ROLLEN as readonly string[]).includes(waarde);
}

export function isHoofdbeheerder(gebruiker: Gebruiker): boolean {
  return gebruiker.rol === "hoofdbeheerder";
}

/** Mag deze gebruiker de gegevens van deze vennootschap zien? */
export function magVennootschapZien(gebruiker: Gebruiker, vennootschapId: string): boolean {
  if (isHoofdbeheerder(gebruiker)) return true;
  return gebruiker.vennootschap_id === vennootschapId;
}

/**
 * De vennootschappen die deze gebruiker mag zien.
 * `null` betekent: geen beperking, dus allemaal.
 */
export function zichtbareVennootschappen(gebruiker: Gebruiker): string[] | null {
  if (isHoofdbeheerder(gebruiker)) return null;
  return gebruiker.vennootschap_id ? [gebruiker.vennootschap_id] : [];
}

/** Laadpalen, vennootschappen, tarieven en instellingen wijzigen. */
export function magInstellingenBeheren(gebruiker: Gebruiker): boolean {
  return isHoofdbeheerder(gebruiker);
}

/**
 * Rapporten aanmaken en verwijderen.
 *
 * Enkel de hoofdbeheerder: het rapport is de onkostennota van de begunstigde,
 * niet iets wat een vennootschap voor zichzelf opmaakt. Inkijken en downloaden
 * mag wel, zie magVennootschapZien.
 */
export function magRapportenMaken(gebruiker: Gebruiker): boolean {
  return isHoofdbeheerder(gebruiker);
}

export function magGebruikersBeheren(gebruiker: Gebruiker): boolean {
  return gebruiker.rol === "hoofdbeheerder" || gebruiker.rol === "vennootschapsbeheerder";
}

/** De rollen die deze gebruiker aan iemand anders mag geven. */
export function toewijsbareRollen(gebruiker: Gebruiker): Rol[] {
  if (isHoofdbeheerder(gebruiker)) return [...ROLLEN];
  if (gebruiker.rol === "vennootschapsbeheerder") {
    // Een vennootschapsbeheerder mag geen hoofdbeheerder maken: dat zou hem
    // toegang geven tot de andere vennootschap.
    return ["vennootschapsbeheerder", "kijker"];
  }
  return [];
}

export interface Uitnodiging {
  email: string;
  rol: Rol;
  vennootschap_id: string | null;
}

export function magUitnodigen(actor: Gebruiker, uitnodiging: Uitnodiging): Beslissing {
  if (!magGebruikersBeheren(actor)) {
    return nee("Je hebt geen rechten om mensen uit te nodigen.");
  }
  if (!toewijsbareRollen(actor).includes(uitnodiging.rol)) {
    return nee(`Je kan de rol ${ROLNAMEN[uitnodiging.rol].toLowerCase()} niet toekennen.`);
  }

  if (uitnodiging.rol === "hoofdbeheerder") {
    if (uitnodiging.vennootschap_id) {
      return nee("Een hoofdbeheerder hoort bij geen enkele vennootschap in het bijzonder.");
    }
    return JA;
  }

  if (!uitnodiging.vennootschap_id) {
    return nee("Kies bij welke vennootschap deze persoon hoort.");
  }
  if (!isHoofdbeheerder(actor) && uitnodiging.vennootschap_id !== actor.vennootschap_id) {
    return nee("Je kan enkel mensen toevoegen aan je eigen vennootschap.");
  }
  return JA;
}

/** Mag de actor deze bestaande gebruiker wijzigen of verwijderen? */
export function magGebruikerBeheren(actor: Gebruiker, doelwit: Gebruiker): Beslissing {
  if (!magGebruikersBeheren(actor)) {
    return nee("Je hebt geen rechten om gebruikers te beheren.");
  }
  if (isHoofdbeheerder(actor)) return JA;

  if (isHoofdbeheerder(doelwit)) {
    return nee("Je kan een hoofdbeheerder niet wijzigen.");
  }
  if (doelwit.vennootschap_id !== actor.vennootschap_id) {
    return nee("Deze persoon hoort bij een andere vennootschap.");
  }
  return JA;
}

export interface Wijziging {
  rol: Rol;
  vennootschap_id: string | null;
}

export function magGebruikerWijzigen(
  actor: Gebruiker,
  doelwit: Gebruiker,
  wijziging: Wijziging,
  aantalHoofdbeheerders: number,
): Beslissing {
  const basis = magGebruikerBeheren(actor, doelwit);
  if (!basis.toegestaan) return basis;

  if (doelwit.vasteBeheerder && wijziging.rol !== "hoofdbeheerder") {
    return nee(
      "Dit adres staat in TOEGELATEN_EMAILS en blijft altijd hoofdbeheerder. " +
        "Haal het daar eerst weg als je dat wil wijzigen.",
    );
  }

  // De laatste hoofdbeheerder mag niet gedegradeerd worden: dan geraakt
  // niemand nog aan de instellingen.
  if (
    isHoofdbeheerder(doelwit) &&
    wijziging.rol !== "hoofdbeheerder" &&
    aantalHoofdbeheerders <= 1
  ) {
    return nee("Dit is de laatste hoofdbeheerder. Stel er eerst een andere aan.");
  }

  // De nieuwe situatie moet ook toegestaan zijn voor de actor.
  return magUitnodigen(actor, {
    email: doelwit.email,
    rol: wijziging.rol,
    vennootschap_id: wijziging.vennootschap_id,
  });
}

export function magGebruikerVerwijderen(
  actor: Gebruiker,
  doelwit: Gebruiker,
  aantalHoofdbeheerders: number,
): Beslissing {
  const basis = magGebruikerBeheren(actor, doelwit);
  if (!basis.toegestaan) return basis;

  if (doelwit.email.toLowerCase() === actor.email.toLowerCase()) {
    return nee("Je kan jezelf niet verwijderen.");
  }
  if (doelwit.vasteBeheerder) {
    return nee(
      "Dit adres staat in TOEGELATEN_EMAILS en kan niet via de app verwijderd worden.",
    );
  }
  if (isHoofdbeheerder(doelwit) && aantalHoofdbeheerders <= 1) {
    return nee("Dit is de laatste hoofdbeheerder.");
  }
  return JA;
}

/** Normaliseert een e-mailadres zodat vergelijken altijd hetzelfde uitpakt. */
export function normaliseerEmail(email: string): string {
  return email.trim().toLowerCase();
}
