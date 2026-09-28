/**
 * De browserkant van i-Active: inloggen, de kalender van een kind en een
 * maand openen, de tegels lezen, en één tegel inschrijven.
 *
 * Wat de kalender nodig heeft om tegels te tonen, staat in opvang/LEESMIJ.md.
 * Niets hier schrijft iets naar de console: wat i-Active toont, kan namen
 * dragen, en de logboeken van deze repository zijn publiek.
 */

import { chromium, type Browser, type Frame, type Page } from "playwright";

import { leesStaat, maandVanTitel, type Staat } from "./tegels.ts";

export const OORSPRONG = "https://sint-katelijne-waver.i-active.be";
export const LOGIN = `${OORSPRONG}/ords/r/iactive01/burgerportaal/login`;
export const KALENDER = `${OORSPRONG}/ords/r/iactive01/burgerportaal/kalender-kinderopvang-nieuw`;
const FOUTMELDING =
  ".t-Alert--danger, .t-Alert--warning, .a-Notification--error, #t_Alert_Notification, .t-Form-error, .apex-page-error, .htmldbStdErr";

export async function startBrowser(): Promise<{ browser: Browser; pagina: Page }> {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  // Een gewone Chrome-identiteit: "HeadlessChrome" kan een bescherming tegen
  // bots anders laten antwoorden.
  const pagina = await browser.newPage({
    locale: "nl-BE",
    timezoneId: "Europe/Brussels",
    viewport: { width: 1400, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  return { browser, pagina };
}

export async function login(pagina: Page, email: string, wachtwoord: string): Promise<void> {
  await pagina.goto(LOGIN, { waitUntil: "networkidle" });
  for (const knop of [".cc-deny", ".cc-dismiss", ".cc-allow"]) {
    const k = pagina.locator(knop).first();
    if (await k.isVisible().catch(() => false)) {
      await k.click();
      break;
    }
  }
  await pagina.fill("#P101_USERNAME", email);
  await pagina.fill("#P101_PASSWORD", wachtwoord);
  await pagina.click("#LOGIN_BUTTON");
  await Promise.race([
    pagina.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 }),
    pagina.locator(FOUTMELDING).first().waitFor({ state: "visible", timeout: 30_000 }),
  ]).catch(() => {});
  await pagina.waitForLoadState("networkidle").catch(() => {});
  if (new URL(pagina.url()).pathname.endsWith("/login")) throw new Error("Inloggen bij i-Active lukte niet.");
}

/** Een kind zoals de kalender het kent: de waarde en de tekst van de optie in #P44_LEERLING. */
export interface Leerling {
  id: string;
  naam: string;
}

export async function leesLeerlingen(pagina: Page): Promise<Leerling[]> {
  return pagina.locator("#P44_LEERLING option").evaluateAll((opties) =>
    opties
      .map((o) => ({ id: (o as HTMLOptionElement).value, naam: (o.textContent ?? "").trim() }))
      .filter((o) => o.id),
  );
}

async function wachtOpRust(pagina: Page, ms = 1500): Promise<void> {
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(ms);
}

/**
 * Opent de kalender voor één kind en één maand ("2026-12"). Gaat met de
 * pijltjes naar de maand, en controleert via de titel dat het de juiste is.
 */
export async function openKalender(pagina: Page, leerlingId: string, maand: string): Promise<void> {
  if (!pagina.url().includes("kalender-kinderopvang-nieuw")) {
    await pagina.goto(KALENDER, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1500);
  }
  const kind = pagina.locator("#P44_LEERLING");
  if ((await kind.inputValue().catch(() => "")) !== leerlingId) {
    await kind.selectOption(leerlingId);
    await wachtOpRust(pagina);
  }
  const groep = pagina
    .locator("select.apex-item-select")
    .filter({ has: pagina.locator("option", { hasText: "Opvang (inschrijvingen)" }) })
    .first();
  const gekozen = await groep.evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent ?? "").catch(() => "");
  if (!gekozen.includes("Opvang (inschrijvingen)")) {
    await groep.selectOption({ label: "Opvang (inschrijvingen)" });
    await wachtOpRust(pagina, 2500);
  }

  for (let stap = 0; stap < 24; stap++) {
    const titel = await pagina.locator(".fc-toolbar-title").first().innerText().catch(() => "");
    const huidig = maandVanTitel(titel);
    if (!huidig) throw new Error("De kalender toont geen maand.");
    if (huidig === maand) break;
    const knop = huidig < maand ? ">" : "<";
    await pagina.getByRole("button", { name: knop, exact: true }).first().click();
    await wachtOpRust(pagina);
    if (stap === 23) throw new Error(`Maand ${maand} niet bereikt in de kalender.`);
  }
  await pagina
    .waitForFunction(() => document.querySelectorAll("a.fc-event, .fc-event").length > 0, undefined, { timeout: 15_000 })
    .catch(() => {});
}

/** Eén tegel: één slot op één dag, op één locatie. */
export interface Tegel {
  datum: string;
  moment: string;
  locatie: string;
  titel: string;
  staat: Staat;
}

/** Leest alle tegels van de getoonde maand. Tegels van de buurmaanden vallen weg. */
export async function leesTegels(pagina: Page, maand: string): Promise<Tegel[]> {
  const ruw = await pagina.evaluate(() => {
    const uit: { datum: string; moment: string; locatie: string; titel: string; klassen: string; iconen: string; balk: string }[] = [];
    for (const dag of Array.from(document.querySelectorAll("td[data-date]"))) {
      const datum = dag.getAttribute("data-date") ?? "";
      for (const tegel of Array.from(dag.querySelectorAll(".fc-event"))) {
        const locatie = (tegel.querySelector(".kal-loc")?.textContent ?? "").trim();
        // De tekst van de tegel zonder de locatie en de balk: het soort opvang.
        const kloon = tegel.cloneNode(true) as HTMLElement;
        kloon.querySelectorAll(".kal-loc, .progress, .progress-bar-text").forEach((e) => e.remove());
        uit.push({
          datum,
          moment: (kloon.textContent ?? "").replace(/\s+/g, " ").trim(),
          locatie,
          titel: tegel.getAttribute("title") ?? tegel.querySelector("[title]")?.getAttribute("title") ?? "",
          klassen: `${tegel.className} ${Array.from(tegel.querySelectorAll("[class]")).map((e) => e.className).join(" ")}`,
          iconen: Array.from(tegel.querySelectorAll("[class*=fa-]")).map((e) => e.className).join(" "),
          balk: (tegel.querySelector(".progress-bar-text")?.textContent ?? "").trim(),
        });
      }
    }
    return uit;
  });
  return ruw
    .filter((t) => t.datum.startsWith(maand))
    .map((t) => ({ datum: t.datum, moment: t.moment, locatie: t.locatie, titel: t.titel, staat: leesStaat(t) }));
}

function tegelLocator(pagina: Page, tegel: Pick<Tegel, "datum" | "moment" | "locatie">) {
  let l = pagina.locator(`td[data-date="${tegel.datum}"] .fc-event`).filter({ hasText: tegel.moment });
  if (tegel.locatie) l = l.filter({ has: pagina.locator(".kal-loc", { hasText: tegel.locatie }) });
  return l;
}

async function venster(pagina: Page): Promise<{ frame: Frame; sluit: () => Promise<void> }> {
  const dialoog = pagina.locator(".ui-dialog:visible, [role=dialog]:visible").first();
  await dialoog.waitFor({ state: "visible", timeout: 20_000 });
  const handvat = await dialoog.locator("iframe").first().elementHandle({ timeout: 10_000 });
  const frame = handvat ? await handvat.contentFrame() : null;
  if (!frame) throw new Error("Het inschrijfvenster heeft geen inhoud.");
  await frame.waitForLoadState("networkidle").catch(() => {});
  await frame.locator("button, a.t-Button").first().waitFor({ state: "visible", timeout: 15_000 });
  const sluit = async () => {
    if (!(await dialoog.isVisible().catch(() => false))) return;
    const knop = frame.locator("button, a.t-Button").filter({ hasText: /^\s*close\s*$/i }).first();
    if (await knop.isVisible().catch(() => false)) await knop.click().catch(() => {});
    else await pagina.keyboard.press("Escape");
    await dialoog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  };
  return { frame, sluit };
}

export type Poging =
  | { soort: "geklikt" }
  | { soort: "proef" }
  | { soort: "niet_gevonden" }
  | { soort: "geen_vinkje" }
  | { soort: "fout"; melding: string };

/**
 * Opent de tegel, vinkt enkel het gevraagde kind aan en klikt op
 * "Inschrijven". Met `proef` stopt het vlak daarvoor en sluit het venster.
 *
 * Of het gelukt is, zegt deze functie niet: dat leest de aanroeper daarna uit
 * de kalender zelf (zie tegels.ts). Een klik is geen inschrijving.
 */
export async function schrijfIn(
  pagina: Page,
  tegel: Pick<Tegel, "datum" | "moment" | "locatie">,
  kindNaam: string,
  proef: boolean,
): Promise<Poging> {
  const l = tegelLocator(pagina, tegel);
  if ((await l.count()) !== 1) return { soort: "niet_gevonden" };
  await l.first().click();
  const { frame, sluit } = await venster(pagina);
  try {
    // De vinkjes: één per kind. Enkel dat van dit kind, alle andere uit.
    const vinkjes = frame.locator("input[type=checkbox][id^=P59_LEERLING_CSV_]");
    const aantal = await vinkjes.count();
    let gevonden = false;
    for (let i = 0; i < aantal; i++) {
      const v = vinkjes.nth(i);
      const id = (await v.getAttribute("id")) ?? "";
      const label = (await frame.locator(`label[for="${id}"]`).first().innerText().catch(() => "")).trim();
      const hoort = naamKlopt(label, kindNaam);
      if (hoort) gevonden = true;
      if ((await v.isChecked()) !== hoort) await zetVinkje(v, hoort);
    }
    if (!gevonden) return { soort: "geen_vinkje" };

    const knop = frame.locator("button, a.t-Button").filter({ hasText: /^\s*Inschrijven\s*$/ }).first();
    if (!(await knop.isVisible().catch(() => false))) return { soort: "fout", melding: "Geen knop Inschrijven in het venster." };
    if (proef) return { soort: "proef" };

    await knop.click();
    // Het venster sluit na een geslaagde inschrijving, of toont een melding.
    const dialoog = pagina.locator(".ui-dialog:visible, [role=dialog]:visible").first();
    const uitkomst = await Promise.race([
      dialoog.waitFor({ state: "hidden", timeout: 30_000 }).then(() => "dicht" as const),
      frame.locator(FOUTMELDING).first().waitFor({ state: "visible", timeout: 30_000 }).then(() => "melding" as const),
    ]).catch(() => "traag" as const);
    if (uitkomst === "melding") {
      const tekst = await frame.locator(FOUTMELDING).first().innerText().catch(() => "");
      return { soort: "fout", melding: tekst.replace(/\s+/g, " ").trim().slice(0, 200) || "Melding zonder tekst." };
    }
    if (uitkomst === "traag") return { soort: "fout", melding: "Het venster sloot niet binnen 30 seconden." };
    return { soort: "geklikt" };
  } finally {
    await sluit();
  }
}

async function zetVinkje(v: ReturnType<Frame["locator"]>, aan: boolean): Promise<void> {
  // APEX verbergt het echte vakje soms achter een eigen weergave.
  if (await v.isVisible().catch(() => false)) await v.setChecked(aan);
  else
    await v.evaluate((e, aan) => {
      (e as HTMLInputElement).checked = aan;
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, aan);
}

/** Het label van het vinkje bevat de voornaam van het kind, soms met de familienaam erbij. */
export function naamKlopt(label: string, naam: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const l = norm(label);
  const n = norm(naam);
  return !!n && (l === n || l.startsWith(`${n} `) || l.includes(n));
}

/** Herlaadt de kalender, zodat de iconen de toestand van nu tonen. */
export async function herlaad(pagina: Page, leerlingId: string, maand: string): Promise<void> {
  await pagina.goto(KALENDER, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1500);
  await openKalender(pagina, leerlingId, maand);
}
