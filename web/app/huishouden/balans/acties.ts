"use server";

import { revalidatePath } from "next/cache";

import {
  isClaim,
  isGebouwd,
  isScore,
  kaartenOmInTeVullen,
  leesBeschikbareTijd,
  leesKaart,
  lijstOpen,
  magAanDeSlag,
  magAkkoordGeven,
  magInschatten,
  magVerderNaInschatten,
  vragenVoor,
  voortgang,
  volgendeFase,
  type Persoon,
  type Ronde,
} from "@/lib/huishouden/balans";
import * as opslag from "@/lib/huishouden/opslag";
import { magHuishoudenZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

/** Wat een actie teruggeeft: de melding die even onderaan het scherm staat. */
export type Resultaat = { ok: true; melding: string } | { ok: false; melding: string };

const PAD = "/huishouden/balans";

/** Wie je bent in Huishouden, en de huidige ronde. Wie niet gekoppeld is, mag niets. */
async function bereidVoor(): Promise<{ persoon: Persoon; ronde: Ronde }> {
  const ik = await vereistGebruiker();
  if (!magHuishoudenZien(ik) || ik.huishouden === null) {
    throw new Fout("Je bent niet gekoppeld aan Huishouden. Vraag het aan de hoofdbeheerder.");
  }
  return { persoon: ik.huishouden, ronde: await opslag.huidigeRonde() };
}

/** Een fout die zo naar de persoon mag: de rest wordt een algemene melding. */
class Fout extends Error {}

async function voer(uit: () => Promise<string>): Promise<Resultaat> {
  try {
    const melding = await uit();
    revalidatePath(PAD);
    return { ok: true, melding };
  } catch (fout) {
    // Een fout uit de databank zegt de persoon weinig; die van ons wel.
    const melding =
      fout instanceof Fout || (fout instanceof Error && fout.message === "Deze kaart bestaat niet meer.")
        ? fout.message
        : "Bewaren lukte niet. Probeer het opnieuw.";
    if (!(fout instanceof Fout)) console.error("Huishouden:", fout);
    revalidatePath(PAD);
    return { ok: false, melding };
  }
}

async function lijstMoetOpen(ronde: Ronde) {
  if (!lijstOpen(ronde)) {
    throw new Fout("De lijst ligt vast. Wil je ze nog aanpassen, start dan in de laatste stap een nieuwe ronde.");
  }
}

function leesId(waarde: unknown): number {
  const id = Number(waarde);
  if (!Number.isInteger(id) || id <= 0) throw new Fout("Deze kaart bestaat niet meer.");
  return id;
}

export async function voegKaartToeActie(invoer: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    await lijstMoetOpen(ronde);
    const gelezen = leesKaart(invoer);
    if (!gelezen.ok) throw new Fout(gelezen.fout);
    await opslag.voegKaartToe(ronde, gelezen.kaart);
    return "Kaart bewaard";
  });
}

export async function wijzigKaartActie(id: unknown, invoer: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    await lijstMoetOpen(ronde);
    const gelezen = leesKaart(invoer);
    if (!gelezen.ok) throw new Fout(gelezen.fout);
    await opslag.wijzigKaart(ronde, leesId(id), gelezen.kaart);
    return "Kaart bewaard";
  });
}

export async function schrapKaartActie(id: unknown, geschrapt: boolean): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    await lijstMoetOpen(ronde);
    await opslag.zetGeschrapt(ronde, leesId(id), geschrapt === true);
    return "Bewaard";
  });
}

export async function verwijderKaartActie(id: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    await lijstMoetOpen(ronde);
    await opslag.verwijderKaart(ronde, leesId(id));
    return "Kaart verwijderd";
  });
}

/** Je eigen akkoord met de lijst. gezieneVersie is de versie van de lijst die je voor je had. */
export async function lijstakkoordActie(akkoord: boolean, gezieneVersie: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { persoon, ronde } = await bereidVoor();
    if (akkoord === true) {
      const beslissing = magAkkoordGeven(ronde, String(gezieneVersie ?? ""), await opslag.telActieveKaarten());
      if (!beslissing.ok) throw new Fout(beslissing.reden);
    } else {
      await lijstMoetOpen(ronde);
    }
    await opslag.zetLijstakkoord(ronde, persoon, akkoord === true);
    return "Bewaard";
  });
}

/** Naar stap 2, voor allebei. */
export async function aanDeSlagActie(): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    if (!isGebouwd("inschatten")) throw new Fout("Stap 2 is er nog niet.");
    const balans = await opslag.leesBalans();
    const beslissing = magAanDeSlag(
      ronde,
      balans.lijstakkoorden,
      balans.kaarten.filter((kaart) => !kaart.geschrapt).length,
    );
    if (!beslissing.ok) throw new Fout(beslissing.reden);
    await opslag.naarFase(ronde, "lijst", "inschatten");
    return "Bewaard";
  });
}

// --- Stap 2 -----------------------------------------------------------------

/** De kaart, als er voor die kaart iets in te vullen is. */
async function kaartOmInTeVullen(id: unknown) {
  const kaart = await opslag.leesKaart(leesId(id));
  if (!kaart || kaartenOmInTeVullen([kaart]).length === 0) throw new Fout("Deze kaart bestaat niet meer.");
  return kaart;
}

async function inschattenMoetKunnen(ronde: Ronde) {
  if (!magInschatten(ronde)) throw new Fout("Jullie zijn nog bij stap 1: eerst moet de lijst vastliggen.");
}

/** Eén score: fysieke tijd of mentale last, van 1 tot 5. Enkel je eigen. */
export async function scoreActie(kaartId: unknown, veld: unknown, score: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { persoon, ronde } = await bereidVoor();
    await inschattenMoetKunnen(ronde);
    if ((veld !== "tijd" && veld !== "last") || !isScore(score)) throw new Fout("Kies een score van 1 tot 5.");
    const kaart = await kaartOmInTeVullen(kaartId);
    if (!vragenVoor(kaart)[veld]) throw new Fout("Voor deze kaart vul je dat niet in.");
    await opslag.zetScore(persoon, kaart.id, veld, score);
    return "Bewaard";
  });
}

/** Hoe graag je een kaart doet. Enkel bij kaarten via het spel, en enkel je eigen. */
export async function claimActie(kaartId: unknown, claim: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { persoon, ronde } = await bereidVoor();
    await inschattenMoetKunnen(ronde);
    if (!isClaim(claim)) throw new Fout("Kies hoe graag je dit doet.");
    const kaart = await kaartOmInTeVullen(kaartId);
    if (!vragenVoor(kaart).claim) throw new Fout("Voor deze kaart vul je dat niet in.");
    await opslag.zetClaim(ronde, persoon, kaart.id, claim);
    return "Bewaard";
  });
}

/** Je beschikbare tijd voor gezin en hobby. Leeg wist ze. */
export async function beschikbareTijdActie(uren: unknown): Promise<Resultaat> {
  return voer(async () => {
    const { persoon, ronde } = await bereidVoor();
    await inschattenMoetKunnen(ronde);
    const gelezen = leesBeschikbareTijd(uren);
    if (!gelezen.ok) throw new Fout(gelezen.fout);
    await opslag.zetBeschikbareTijd(persoon, gelezen.uren);
    return "Bewaard";
  });
}

/** Verder na stap 2, voor allebei, als allebei alles ingevuld hebben en de volgende stap er al is. */
export async function verderNaInschattenActie(): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    const naar = volgendeFase("inschatten");
    if (!naar) throw new Fout("De volgende stap is er nog niet.");
    const [{ kaarten }, inschattingen] = await Promise.all([opslag.leesBalans(), opslag.leesInschattingen(ronde)]);
    const stand = {
      jan: voortgang(kaarten, inschattingen.invoer.jan, inschattingen.beschikbareTijd.jan),
      sandra: voortgang(kaarten, inschattingen.invoer.sandra, inschattingen.beschikbareTijd.sandra),
    };
    const beslissing = magVerderNaInschatten(ronde, stand);
    if (!beslissing.ok) throw new Fout(beslissing.reden);
    await opslag.naarFase(ronde, "inschatten", naar);
    return "Bewaard";
  });
}

/** Alles resetten, voor allebei. De kaarten blijven staan. */
export async function allesResettenActie(): Promise<Resultaat> {
  return voer(async () => {
    const { ronde } = await bereidVoor();
    await opslag.allesResetten(ronde);
    return "Alles gereset.";
  });
}
