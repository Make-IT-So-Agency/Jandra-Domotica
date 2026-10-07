/**
 * Schrijft exact de definitieve keuze in, op het moment dat i-Active opent,
 * en controleert elk slot daarna in i-Active zelf.
 *
 *   node src/reserveren.ts                 de ronde van het startsein (zie
 *                                          startsein.ts): wacht tot de opening
 *                                          en schrijft in, of meteen als de
 *                                          opening minder dan 24 uur voorbij is
 *   node src/reserveren.ts --inhalen       de laatste definitieve keuze waarvan
 *                                          de opening voorbij is, nu nog
 *                                          inschrijven, hoe lang ook geleden.
 *                                          Enkel met de hand.
 *   node src/reserveren.ts --proef         alles behalve de klik op
 *                                          "Inschrijven"; wacht niet op de
 *                                          opening en verandert geen status
 *   node src/reserveren.ts --proef --maand 2026-11
 *                                          proef op enkele tegels die nu al
 *                                          open staan (één vrije, één volzette)
 *   node src/reserveren.ts --test 2026-11-16:voor
 *                                          schrijft ÉCHT dat ene slot in, voor
 *                                          het kind dat ingepland wordt, en
 *                                          controleert het. Enkel met de hand.
 *
 * Regels, zie opvang/LEESMIJ.md:
 * - Enkel wat in opvang_keuzes staat voor een ronde met status definitief.
 * - Een klik is geen inschrijving: gelukt is wat de tegel daarna zegt.
 * - Volzet: toch inschrijven, dan komt het kind op de reservelijst.
 * - Een hapering in i-Active kost één slot één poging, niet de hele run.
 *
 * Telegram krijgt per slot een melding en op het einde een verslag. Het
 * logboek van de workflow is publiek en krijgt enkel aantallen.
 */

import type { Page } from "playwright";

import { herlaad, leesTegels, login, naarKalender, openKalender, schrijfIn, soortVan, startBrowser, zoekTegel, type Poging, type Tegel } from "./iactive.ts";
import { lopendeRondes, ronde as leesRonde, zetStatus, type Ronde } from "./rondes.ts";
import { besluit } from "./startsein.ts";
import { rest } from "./supabase.ts";
import { afgehandeld, inschrijfbaar, type Staat } from "./tegels.ts";
import { leesChat, stuur } from "./telegram.ts";
import { zuiverLabel } from "./verslag.ts";
import { dagLabel, duur, langMoment, momentLabel, uurLabel } from "./weergave.ts";

const argumenten = process.argv.slice(2);
const na = (vlag: string) => {
  const i = argumenten.indexOf(vlag);
  return i >= 0 ? argumenten[i + 1] : undefined;
};
const proef = argumenten.includes("--proef");
const proefMaand = na("--maand");
const test = na("--test");
const inhalen = argumenten.includes("--inhalen");
/** Zo lang vóór de opening loggen we in. */
const INLOGGEN_VOOR_MS = 6 * 60_000;
/** Na dit moment vóór de opening kan in Telegram niet meer gewijzigd worden (zie web/lib/opvang/menu.ts). */
const VASTLEGGEN_VOOR_MS = 4 * 60_000;
/** Zo lang na de opening blijven we de kalender herladen tot de tegels opengaan. */
const MAX_WACHTEN_OP_OPENING_MS = 20 * 60_000;

interface Keuze {
  slotId: number;
  kindId: number;
  leerlingId: string;
  kind: string;
  datum: string;
  moment: string;
  locatie: string;
}

type Uitkomst = "ingeschreven" | "reservelijst" | "al_ingeschreven" | "mislukt" | "gestopt";
type Uitslag = { uitkomst: Uitkomst; melding?: string };

const slaap = (ms: number) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));

/** De eerste regel van een fout, kort. Fouten van iactive.ts dragen geen namen. */
const kort = (fout: unknown, lengte = 200) => (fout instanceof Error ? fout.message.split("\n")[0].slice(0, lengte) : "onbekende fout");

let chat: number | null = null;
async function meld(tekst: string): Promise<void> {
  // In het publieke logboek: dezelfde tekst, met namen en getallen gemaskeerd.
  console.log(`Telegram: ${tekst.split("\n").map((r) => zuiverLabel(r, 200)).join(" / ")}`);
  if (!chat) return;
  await stuur(chat, proef ? `🧪 PROEF · ${tekst}` : tekst).catch((f) => console.log(`Telegram mislukt: ${String(f).slice(0, 120)}`));
}

/** Inloggen en naar de kalender, met twee herkansingen: i-Active hapert soms even. */
async function aanmelden(pagina: Page): Promise<void> {
  const email = process.env.IACTIVE_EMAIL;
  const wachtwoord = process.env.IACTIVE_WACHTWOORD;
  if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");
  for (let poging = 1; ; poging++) {
    try {
      await login(pagina, email, wachtwoord);
      await naarKalender(pagina);
      return;
    } catch (fout) {
      if (poging === 3) throw fout;
      console.log(`Inloggen, poging ${poging}: ${kort(fout)}`);
      await slaap(20_000);
    }
  }
}

/** Na een fout: terug naar de kalender, en opnieuw inloggen als de sessie weg is. */
async function herstel(pagina: Page): Promise<void> {
  try {
    await naarKalender(pagina);
  } catch {
    await aanmelden(pagina);
  }
}

/** Een stap, en bij een fout nog één keer na herstel. */
async function metHerkansing<T>(pagina: Page, stap: () => Promise<T>): Promise<T> {
  try {
    return await stap();
  } catch (fout) {
    console.log(`Herkansing na: ${kort(fout)}`);
    await herstel(pagina);
    return stap();
  }
}

async function leesKeuzes(rondeId: number): Promise<Keuze[]> {
  const rijen = await rest<
    { slot_id: number; opvang_slots: { kind_id: number; datum: string; moment: string; locatie: string; opvang_kinderen: { leerling_id: string; naam: string; plannen: boolean } } }[]
  >("GET", `opvang_keuzes?ronde_id=eq.${rondeId}&select=slot_id,opvang_slots(kind_id,datum,moment,locatie,opvang_kinderen(leerling_id,naam,plannen))`);
  return rijen
    .filter((r) => r.opvang_slots?.opvang_kinderen?.plannen)
    .map((r) => ({
      slotId: r.slot_id,
      kindId: r.opvang_slots.kind_id,
      leerlingId: r.opvang_slots.opvang_kinderen.leerling_id,
      kind: r.opvang_slots.opvang_kinderen.naam,
      datum: r.opvang_slots.datum,
      moment: r.opvang_slots.moment,
      locatie: r.opvang_slots.locatie,
    }))
    .sort((a, b) => a.kindId - b.kindId || a.datum.localeCompare(b.datum));
}

async function bewaarResultaat(rondeId: number, slotId: number, uitkomst: Uitkomst, melding?: string): Promise<void> {
  if (proef || rondeId < 0) return;
  await rest(
    "POST",
    "opvang_resultaten?on_conflict=ronde_id,slot_id",
    { ronde_id: rondeId, slot_id: slotId, uitkomst, melding: melding?.slice(0, 300) ?? null, op: new Date().toISOString() },
    "resolution=merge-duplicates,return=minimal",
  );
}

function label(k: Keuze): string {
  const loc = k.locatie.replace(/^BKO\s*-\s*/i, "");
  return `${dagLabel(k.datum)} ${langMoment(k.moment)}${loc ? ` (${loc})` : ""}`;
}

const TEKEN: Record<Uitkomst, string> = {
  ingeschreven: "✔",
  reservelijst: "⏸",
  al_ingeschreven: "✔",
  mislukt: "❌",
  gestopt: "🛑",
};

function uitleg(u: Uitkomst): string {
  return {
    ingeschreven: "ingeschreven",
    reservelijst: "RESERVELIJST (volzet, schuift door als er plaats vrijkomt)",
    al_ingeschreven: "was al ingeschreven",
    mislukt: "NIET gelukt",
    gestopt: "niet gedaan (gestopt)",
  }[u];
}

/** De staat van één gekozen slot zoals de kalender het nu toont. */
async function staatNu(pagina: Page, k: Keuze): Promise<{ staat: Staat | "weg"; tegel: Tegel | null }> {
  const tegel = zoekTegel(await leesTegels(pagina, k.datum.slice(0, 7)), k);
  return { staat: tegel?.staat ?? "weg", tegel };
}

function uitkomstVan(staat: Staat | "weg"): Uitkomst | null {
  if (staat === "ingeschreven") return "ingeschreven";
  if (staat === "reservelijst") return "reservelijst";
  return null;
}

/**
 * Wacht tot de gekozen tegels in de kalender opengaan (of al ingeschreven
 * zijn). Een run die na de opening start, komt hier meteen voorbij; ook als
 * alles intussen gesloten is, valt er niets meer te wachten.
 */
async function wachtOpOpening(pagina: Page, keuzes: Keuze[]): Promise<boolean> {
  const eerste = keuzes[0];
  const maand = eerste.datum.slice(0, 7);
  const tot = Date.now() + MAX_WACHTEN_OP_OPENING_MS;
  let beurt = 0;
  while (Date.now() < tot) {
    try {
      await herlaad(pagina, eerste.leerlingId, maand);
      const tegels = await leesTegels(pagina, maand);
      const staten = keuzes
        .filter((k) => k.leerlingId === eerste.leerlingId && k.datum.startsWith(maand))
        .map((k) => zoekTegel(tegels, k)?.staat)
        .filter((s): s is Staat => !!s);
      if (staten.some((s) => inschrijfbaar(s) || afgehandeld(s))) return true;
      if (staten.length && staten.every((s) => s === "gesloten")) return true;
    } catch (fout) {
      // Eén keer haperen (een kalender zonder maand, een trage pagina) is geen reden om op te geven.
      console.log(`Kalender herladen mislukt: ${kort(fout)}`);
      await herstel(pagina).catch(() => {});
    }
    if (++beurt % 20 === 0) console.log(`Nog niet open na ${beurt} pogingen.`);
    await slaap(2000);
  }
  return false;
}

async function stopGevraagd(id: number): Promise<boolean> {
  if (proef || id < 0) return false;
  return (await leesRonde(id))?.stop_gevraagd ?? false;
}

/**
 * Eén gekozen slot: de tegel lezen, zo nodig inschrijven, en nalezen. Geeft
 * null bij een proef die niets aanklikte. Een fout gaat naar de aanroeper.
 */
async function verwerkSlot(pagina: Page, k: Keuze): Promise<Uitslag | null> {
  let { staat } = await staatNu(pagina, k);
  const al = uitkomstVan(staat);
  if (al === "reservelijst") return { uitkomst: "reservelijst", melding: "Stond al op de reservelijst." };
  if (al) return { uitkomst: "al_ingeschreven" };
  if (staat === "weg") return { uitkomst: "mislukt", melding: "Tegel niet meer gevonden in de kalender." };
  if (proef && staat === "nog_niet_open") {
    await meld(`${label(k)}: tegel gevonden, nog niet open.`);
    return null;
  }
  if (!inschrijfbaar(staat)) {
    return { uitkomst: "mislukt", melding: staat === "gesloten" ? "Inschrijven is gesloten voor dit slot." : `Tegel is ${staat.replace("_", " ")}.` };
  }
  const volzet = staat === "volzet";
  const resultaat: Poging = await schrijfIn(pagina, k, k.kind, proef);
  if (resultaat.soort === "proef") {
    await meld(`${label(k)}: venster geopend, ${k.kind} aangevinkt, knop Inschrijven gevonden${volzet ? " (volzet → reservelijst)" : ""}. Niet geklikt.`);
    return null;
  }
  const geklikt = resultaat.soort === "geklikt" || (resultaat.soort === "fout" && resultaat.geklikt === true);
  if (!geklikt) {
    return {
      uitkomst: "mislukt",
      melding:
        resultaat.soort === "fout"
          ? resultaat.melding
          : resultaat.soort === "geen_vinkje"
            ? `Geen vinkje voor ${k.kind} in het venster.`
            : "Tegel niet gevonden.",
    };
  }
  // Nu de controle: wat zegt de tegel? Eerst zonder herladen, dan met.
  await pagina.waitForTimeout(1500);
  ({ staat } = await staatNu(pagina, k));
  let uitkomst = uitkomstVan(staat);
  if (!uitkomst) {
    await herlaad(pagina, k.leerlingId, k.datum.slice(0, 7));
    ({ staat } = await staatNu(pagina, k));
    uitkomst = uitkomstVan(staat);
  }
  if (uitkomst) return { uitkomst };
  return {
    uitkomst: "mislukt",
    melding: `Geklikt, maar de tegel toont geen inschrijving (${staat}).${resultaat.soort === "fout" ? ` i-Active: ${resultaat.melding}` : ""}`,
  };
}

async function verwerk(pagina: Page, r: Ronde, keuzes: Keuze[]): Promise<Map<number, Uitslag>> {
  const klaar = new Map<number, Uitslag>();
  // Wat een vorige, afgebroken run al deed, doen we niet opnieuw.
  if (!proef && r.id > 0) {
    for (const rij of await rest<{ slot_id: number; uitkomst: Uitkomst }[]>("GET", `opvang_resultaten?ronde_id=eq.${r.id}`)) {
      if (rij.uitkomst !== "mislukt" && rij.uitkomst !== "gestopt") klaar.set(rij.slot_id, { uitkomst: rij.uitkomst });
    }
  }

  for (const poging of [1, 2]) {
    let huidig = "";
    for (const k of keuzes) {
      if (klaar.has(k.slotId) && klaar.get(k.slotId)!.uitkomst !== "mislukt") continue;
      if (await stopGevraagd(r.id)) {
        for (const rest of keuzes.filter((x) => !klaar.has(x.slotId) || klaar.get(x.slotId)!.uitkomst === "mislukt")) {
          klaar.set(rest.slotId, { uitkomst: "gestopt" });
          await bewaarResultaat(r.id, rest.slotId, "gestopt");
        }
        await meld("🛑 Gestopt op vraag. Wat hierboven staat, is gebeurd; de rest niet.");
        return klaar;
      }
      let uitslag: Uitslag | null;
      try {
        const kalender = `${k.leerlingId}|${k.datum.slice(0, 7)}`;
        if (huidig !== kalender) {
          await openKalender(pagina, k.leerlingId, k.datum.slice(0, 7));
          huidig = kalender;
        }
        uitslag = await verwerkSlot(pagina, k);
      } catch (fout) {
        // Een hapering in i-Active kost dit slot deze poging, niet de hele run.
        // Wat al geklikt was, ziet de tweede poging of de eindcontrole aan de tegel.
        uitslag = { uitkomst: "mislukt", melding: kort(fout, 150) };
        huidig = "";
        await herstel(pagina).catch((f) => console.log(`Herstellen mislukt: ${kort(f)}`));
      }
      if (!uitslag) continue;
      klaar.set(k.slotId, uitslag);
      await bewaarResultaat(r.id, k.slotId, uitslag.uitkomst, uitslag.melding);
      if (uitslag.uitkomst !== "mislukt" || poging === 2 || proef) {
        await meld(`${TEKEN[uitslag.uitkomst]} ${k.kind} · ${label(k)}: ${uitleg(uitslag.uitkomst)}${uitslag.melding ? `\n   ${uitslag.melding}` : ""}`);
      }
    }
    if (proef || ![...klaar.values()].some((v) => v.uitkomst === "mislukt")) break;
    await meld("↻ Tweede poging voor wat niet lukte…");
  }
  return klaar;
}

/**
 * Leest elke gekozen tegel opnieuw, van nul, en zet de uitkomst gelijk met wat
 * i-Active zegt. Lukt een kalender ook na een herkansing niet, dan blijft de
 * uitkomst van vlak na de klik staan, en telt hij bij `nietGelezen`.
 */
async function eindcontrole(pagina: Page, r: Ronde, keuzes: Keuze[], klaar: Map<number, Uitslag>) {
  const perKalender = new Map<string, Keuze[]>();
  for (const k of keuzes) perKalender.set(`${k.leerlingId}|${k.datum.slice(0, 7)}`, [...(perKalender.get(`${k.leerlingId}|${k.datum.slice(0, 7)}`) ?? []), k]);
  const verschil: string[] = [];
  let nietGelezen = 0;
  let eerste = true;
  for (const [sleutel, lijst] of perKalender) {
    const [leerling, maand] = sleutel.split("|");
    let tegels: Tegel[];
    try {
      tegels = await metHerkansing(pagina, async () => {
        if (eerste) await herlaad(pagina, leerling, maand);
        else await openKalender(pagina, leerling, maand);
        return leesTegels(pagina, maand);
      });
    } catch (fout) {
      console.log(`Eindcontrole van ${lijst.length} momenten niet gelukt: ${kort(fout)}`);
      nietGelezen += lijst.length;
      continue;
    } finally {
      eerste = false;
    }
    for (const k of lijst) {
      const staat = zoekTegel(tegels, k)?.staat ?? "weg";
      const gezien = uitkomstVan(staat);
      const vorig = klaar.get(k.slotId);
      if (!vorig || vorig.uitkomst === "gestopt") continue;
      const wasGoed = vorig.uitkomst !== "mislukt";
      if (gezien && !wasGoed) {
        klaar.set(k.slotId, { uitkomst: gezien });
        await bewaarResultaat(r.id, k.slotId, gezien, "Bij de eindcontrole toch ingeschreven gevonden.");
      } else if (!gezien && wasGoed) {
        klaar.set(k.slotId, { uitkomst: "mislukt", melding: `Bij de eindcontrole niet ingeschreven (${staat}).` });
        await bewaarResultaat(r.id, k.slotId, "mislukt", `Bij de eindcontrole niet ingeschreven (${staat}).`);
        verschil.push(`${k.kind} · ${label(k)}`);
      } else if (gezien === "reservelijst" && vorig.uitkomst === "ingeschreven") {
        klaar.set(k.slotId, { uitkomst: "reservelijst" });
        await bewaarResultaat(r.id, k.slotId, "reservelijst");
      }
    }
  }
  return { verschil, nietGelezen };
}

function verslag(r: Ronde, keuzes: Keuze[], klaar: Map<number, Uitslag>): string {
  const groepen: [string, Uitkomst[]][] = [
    ["✔ Ingeschreven", ["ingeschreven", "al_ingeschreven"]],
    ["⏸ Reservelijst (volzet)", ["reservelijst"]],
    ["❌ Niet gelukt, doe dit zelf", ["mislukt"]],
    ["🛑 Niet gedaan", ["gestopt"]],
  ];
  const regels = [`📋 Verslag opvang ${r.maand}: ${keuzes.length} gekozen momenten, gecontroleerd in i-Active.`];
  for (const [kop, soorten] of groepen) {
    const lijst = keuzes.filter((k) => soorten.includes(klaar.get(k.slotId)?.uitkomst ?? "mislukt"));
    if (!lijst.length) continue;
    regels.push("", `${kop}: ${lijst.length}`);
    for (const k of lijst) {
      const m = klaar.get(k.slotId)?.melding;
      regels.push(`• ${k.kind} · ${label(k)}${m ? ` (${m})` : ""}`);
    }
  }
  return regels.join("\n");
}

/** Het kind dat ingepland wordt (voor --maand en --test): precies één, anders stoppen. */
async function planKind(): Promise<{ id: number; leerling_id: string; naam: string }> {
  const lijst = await rest<{ id: number; leerling_id: string; naam: string }[]>("GET", "opvang_kinderen?plannen=is.true&order=id");
  if (lijst.length !== 1) throw new Error(`Verwacht precies één kind dat ingepland wordt, gevonden: ${lijst.length}.`);
  return lijst[0];
}

/** Proef of test op tegels die nu al open staan, zonder ronde. */
async function losseRun(): Promise<void> {
  const kind = await planKind();
  const { browser, pagina } = await startBrowser();
  try {
    await aanmelden(pagina);
    const maand = (test ?? proefMaand ?? "").slice(0, 7);
    await openKalender(pagina, kind.leerling_id, maand);
    const tegels = await leesTegels(pagina, maand);
    let gekozen: Tegel[];
    if (test) {
      const [datum, soort] = test.split(":");
      gekozen = tegels.filter((t) => t.datum === datum && soortVan(t.moment) === soort);
      if (gekozen.length !== 1) throw new Error(`Voor ${test} ${gekozen.length} tegels gevonden in plaats van één.`);
    } else {
      gekozen = [tegels.find((t) => t.staat === "vrij"), tegels.find((t) => t.staat === "volzet")].filter((t): t is Tegel => !!t);
    }
    const keuzes: Keuze[] = gekozen.map((t, i) => ({ slotId: -1 - i, kindId: kind.id, leerlingId: kind.leerling_id, kind: kind.naam, datum: t.datum, moment: t.moment, locatie: t.locatie }));
    await meld(test ? `🧪 ECHTE TEST: ik schrijf ${kind.naam} in voor ${keuzes.map(label).join(", ")} en controleer het.` : `Proef op ${keuzes.length} open tegels van ${maand}.`);
    const nep: Ronde = { id: -1, maand, ronde: "test", opent: new Date().toISOString(), status: "bezig", stop_gevraagd: false, bezig_sinds: null };
    const klaar = await verwerk(pagina, nep, keuzes);
    if (test) {
      await eindcontrole(pagina, nep, keuzes, klaar);
      await meld(verslag(nep, keuzes, klaar));
    } else {
      await meld("Proef klaar. Er is niets ingeschreven.");
    }
  } finally {
    await browser.close();
  }
}

/** Wat de ouders na een fout moeten weten: wat er nu gebeurt, en wat ze zelf kunnen doen. */
const NA_EEN_FOUT =
  "Kijk in i-Active wat er al staat en schrijf de rest zelf in. Doe je dat niet, dan probeert een volgende run het nog, tot 24 uur na de opening; wat al ingeschreven is, slaat die over.";

async function main() {
  chat = await leesChat();
  if (test || proefMaand) return losseRun();
  const nu = Date.now();
  let r: Ronde;
  if (proef) {
    // De volgende ronde; is er geen, dan de laatste (een ronde die na de opening bleef liggen).
    const lopend = await lopendeRondes();
    const gekozen = lopend.find((x) => Date.parse(x.opent) > nu) ?? lopend.at(-1);
    if (!gekozen) {
      console.log("Geen lopende ronde om op te proeven.");
      return;
    }
    r = gekozen;
  } else {
    const b = besluit(await lopendeRondes(), nu, inhalen);
    if (b.soort !== "inschrijven") {
      console.log(b.soort === "niets" ? b.reden : `Ronde ${b.ronde.maand} opent pas over ${duur(Date.parse(b.ronde.opent) - nu)}.`);
      if (inhalen && b.soort === "niets") await meld(`Niets in te halen. ${b.reden}`);
      return;
    }
    r = b.ronde;
  }
  const opent = new Date(r.opent).getTime();
  // Na de opening: niet meer wachten, meteen inschrijven.
  const laat = !proef && nu > opent;
  console.log(`Ronde ${r.maand}, status ${r.status}, ${laat ? `opende ${duur(nu - opent)} geleden` : `opent over ${duur(opent - nu)}`}.`);

  if (r.status === "bezig" && !proef) {
    const sinds = r.bezig_sinds ? Date.now() - new Date(r.bezig_sinds).getTime() : Infinity;
    if (sinds < 30 * 60_000) {
      console.log("Een andere run is al bezig.");
      return;
    }
    await meld("Een vorige run is blijven hangen; ik neem over en doe enkel wat nog niet gebeurd is.");
  }

  if (!proef && r.status === "open") {
    if (laat) {
      if (await zetStatus(r.id, ["open"], "gemist")) await meld(`Niet definitief gemaakt vóór de opening. Ik schrijf niets in voor ${r.maand}.`);
      return;
    }
    await meld(
      `⚠️ Opvang ${r.maand} is nog NIET definitief. De inschrijving opent vandaag om ${uurLabel(opent)}. Druk vóór dan op 🔒 Definitief maken, anders schrijf ik niets in.`,
    );
    while (Date.now() < opent - VASTLEGGEN_VOOR_MS) {
      await slaap(60_000);
      const vers = await leesRonde(r.id);
      if (vers?.status !== "open") break;
    }
    const vers = await leesRonde(r.id);
    if (vers?.status !== "definitief") {
      if (await zetStatus(r.id, ["open"], "gemist")) {
        await meld(`Niet definitief gemaakt. Ik schrijf niets in voor ${r.maand}.`);
      }
      return;
    }
    r.status = "definitief";
  }

  if (laat && r.stop_gevraagd && r.status === "definitief") {
    // Na de opening en na /stop: niet meer inloggen, wel vastleggen dat er niets ingeschreven is.
    for (const k of await leesKeuzes(r.id)) await bewaarResultaat(r.id, k.slotId, "gestopt");
    await zetStatus(r.id, ["definitief"], "klaar", { klaar_op: new Date().toISOString() });
    await meld(`🛑 Je vroeg met /stop om te stoppen: ik schrijf niets in voor ${r.maand}.`);
    return;
  }

  if (laat) {
    await meld(
      inhalen
        ? `↩️ Ik haal de inschrijving voor opvang ${r.maand} in: ze opende ${momentLabel(opent)}, ${duur(nu - opent)} geleden. Wat intussen volzet is, komt op de reservelijst.`
        : `⚠️ Ik ben te laat: GitHub startte deze taak pas om ${uurLabel(nu)}, ${duur(nu - opent)} na de opening van ${uurLabel(opent)}. Ik schrijf nu toch in; wat intussen volzet is, komt op de reservelijst. Stoppen kan met /stop.`,
    );
  } else if (!proef) {
    await slaap(opent - INLOGGEN_VOOR_MS - Date.now());
  }

  const { browser, pagina } = await startBrowser();
  let geclaimd = false;
  try {
    await aanmelden(pagina);

    if (!proef && !laat) await slaap(opent - VASTLEGGEN_VOOR_MS - Date.now());
    const keuzes = await leesKeuzes(r.id);
    if (!keuzes.length) {
      await meld(`Er is niets gekozen voor ${r.maand}; ik doe niets.`);
      if (!proef) await zetStatus(r.id, ["definitief"], "klaar", { klaar_op: new Date().toISOString() });
      return;
    }
    if (!proef) {
      geclaimd = await zetStatus(r.id, ["definitief", "bezig"], "bezig", { bezig_sinds: new Date().toISOString() });
      if (!geclaimd) {
        await meld(`De keuze voor ${r.maand} is niet meer definitief; ik doe niets.`);
        return;
      }
    }
    console.log(`Gekozen momenten: ${keuzes.length}`);
    await meld(
      proef
        ? `Proef met ${keuzes.length} momenten: ik open elk venster, vink aan, en klik NIET op Inschrijven.`
        : laat
          ? `🟢 Ingelogd bij i-Active. Ik schrijf nu ${keuzes.length} momenten in.`
          : `🟢 Ingelogd bij i-Active. Om ${uurLabel(opent, true)} schrijf ik ${keuzes.length} momenten in. Stoppen kan met /stop.`,
    );

    if (!proef) {
      await slaap(opent - Date.now() + 1000);
      if (!(await wachtOpOpening(pagina, keuzes))) {
        await meld(`❌ De tegels gingen niet open binnen 20 minuten na het openingsuur. Ik stop. ${NA_EEN_FOUT}`);
        await zetStatus(r.id, ["bezig"], "definitief");
        return;
      }
      if (!laat) await meld("🚀 i-Active is open. Ik schrijf in…");
    }

    const klaar = await verwerk(pagina, r, keuzes);
    if (proef) {
      await meld("Proef klaar. Er is niets ingeschreven en niets gewijzigd.");
      return;
    }
    const { verschil, nietGelezen } = await eindcontrole(pagina, r, keuzes, klaar);
    if (verschil.length) await meld(`⚠️ Bij de eindcontrole bleken deze toch niet ingeschreven:\n${verschil.map((v) => `• ${v}`).join("\n")}`);
    if (nietGelezen) await meld(`⚠️ De eindcontrole kon ${nietGelezen} momenten niet opnieuw lezen; voor die momenten geldt wat de tegel vlak na de klik zei.`);
    await meld(verslag(r, keuzes, klaar));
    const telling = new Map<string, number>();
    for (const v of klaar.values()) telling.set(v.uitkomst, (telling.get(v.uitkomst) ?? 0) + 1);
    console.log(`Klaar: ${[...telling].map(([u, n]) => `${u} ${n}`).join(", ")}`);
    await zetStatus(r.id, ["bezig"], "klaar", { klaar_op: new Date().toISOString() });
  } catch (fout) {
    const reden = kort(fout);
    console.log(`Gestopt: ${reden}`);
    await meld(`❌ Fout tijdens het inschrijven: ${reden}\nWat hierboven als gelukt staat, is gebeurd. ${NA_EEN_FOUT}`);
    // Terug naar definitief, zodat een nieuwe run verder kan waar deze stopte.
    if (geclaimd) await zetStatus(r.id, ["bezig"], "definitief").catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main().catch(async (fout) => {
  console.log(`Gestopt: ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
  await meld("❌ De inschrijving kon niet starten. Schrijf zelf in via i-Active.");
  process.exitCode = 1;
});
