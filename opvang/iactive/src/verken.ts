/**
 * Verkent i-Active zonder iets te wijzigen, en schrijft een verslag zonder
 * persoonsgegevens (zie verslag.ts).
 *
 *   node src/verken.ts              enkel de loginpagina: laadt die in een
 *                                   echte browser, of blokkeert iets?
 *   node src/verken.ts --inloggen   logt in met IACTIVE_EMAIL en
 *                                   IACTIVE_WACHTWOORD en volgt de veilige
 *                                   menu-items
 *
 * Er wordt nooit op een knop geklikt behalve "Aanmelden" en het wegklikken
 * van de cookiemelding, en er wordt niets ingevuld behalve de login.
 */

import { chromium, type Frame, type Page } from "playwright";

import { alsMarkdown, veiligeLink, veiligMenuItem, zuiverLabel, zuiverUrl, type Pagina } from "./verslag.ts";

const OORSPRONG = "https://sint-katelijne-waver.i-active.be";
const LOGIN = `${OORSPRONG}/ords/r/iactive01/burgerportaal/login`;
const MAX_PAGINAS = 12;
const FOUTMELDING =
  ".t-Alert--danger, .t-Alert--warning, .a-Notification--error, #t_Alert_Notification, .t-Form-error, .apex-page-error, .htmldbStdErr";

async function leesPagina(pagina: Page, status: number | null): Promise<Pagina> {
  const gegevens = await pagina.evaluate(() => {
    const zichtbaar = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const velden = [...document.querySelectorAll("input, select, textarea")]
      .filter((e) => (e as HTMLInputElement).type !== "hidden" && zichtbaar(e))
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        type: (e as HTMLInputElement).type ?? "",
        id: e.id,
        naam: e.getAttribute("name") ?? "",
      }));
    const knoppen = [...document.querySelectorAll("button, input[type=submit], a.t-Button")]
      .filter(zichtbaar)
      .map((e) => ({ id: e.id, label: (e as HTMLElement).innerText || e.getAttribute("aria-label") || "" }));
    const menu = [
      ...document.querySelectorAll(
        "nav a[href], [role=navigation] a[href], .t-TreeNav a[href], .t-NavigationBar a[href], .t-Header a[href], .a-TreeView-label, .t-Card a[href]",
      ),
    ].map((e) => ({ label: (e as HTMLElement).innerText, href: (e as HTMLAnchorElement).href ?? "" }));
    const kolomkoppen = [...document.querySelectorAll("th")].map((e) => (e as HTMLElement).innerText);
    const html = document.documentElement.outerHTML;
    const signalen: string[] = [];
    if (/recaptcha|hcaptcha|turnstile/i.test(html)) signalen.push("captcha-script");
    if (/incapsula|_Incapsula_Resource|zenedge.*challenge/i.test(html)) signalen.push("bot-uitdaging");
    if (document.querySelector(".cc-window")) signalen.push("cookiemelding");
    if (document.querySelector(".t-Alert--danger, .a-Notification--error, #t_Alert_Notification")) signalen.push("foutmelding");
    return {
      titel: document.title,
      velden,
      knoppen,
      menu,
      kolomkoppen,
      aantalRegio: document.querySelectorAll(".t-Region, .t-Card, [id^=R]").length,
      aantalTabelrijen: document.querySelectorAll("tbody tr").length,
      signalen,
    };
  });
  return { url: pagina.url(), status, ...gegevens };
}

interface Knoop {
  tag: string;
  id: string;
  klassen: string;
  attributen: Record<string, string>;
  tekst: string;
  kinderen: Knoop[];
}

/** De HTML-structuur van een element, met tekst en attributen gemaskeerd. */
function skelet(knoop: Knoop, inspringing = ""): string {
  const attrs = Object.entries(knoop.attributen)
    .map(([k, v]) => ` ${k}="${k === "href" ? zuiverUrl(v) : zuiverLabel(v, 60)}"`)
    .join("");
  const kop = `${inspringing}<${knoop.tag}${knoop.id ? ` id="${zuiverLabel(knoop.id, 60)}"` : ""}${knoop.klassen ? ` class="${knoop.klassen}"` : ""}${attrs}>`;
  const tekst = knoop.tekst ? ` "${zuiverLabel(knoop.tekst, 60)}"` : "";
  return [kop + tekst, ...knoop.kinderen.map((k) => skelet(k, inspringing + "  "))].join("\n");
}

/** Leest de structuur van elementen in de pagina (of een frame), tot een bepaalde diepte. */
async function leesStructuur(doel: Page | Frame, selector: string, max: number, diepte = 6): Promise<Knoop[]> {
  return doel.evaluate(
    ({ selector, max, diepte }) => {
      const lees = (el: Element, diepte: number): Knoop => {
        const attributen: Record<string, string> = {};
        for (const a of Array.from(el.attributes)) {
          if (a.name === "id" || a.name === "class" || a.name === "style") continue;
          if (a.name.startsWith("data-") || ["href", "role", "title", "aria-label", "type", "name", "onclick"].includes(a.name)) {
            attributen[a.name] = a.value.slice(0, 120);
          }
        }
        const eigenTekst = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? "")
          .join(" ")
          .trim();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id,
          klassen: typeof el.className === "string" ? el.className : "",
          attributen,
          tekst: eigenTekst,
          kinderen: diepte > 0 ? Array.from(el.children).slice(0, 12).map((k) => lees(k, diepte - 1)) : [],
        };
      };
      return Array.from(document.querySelectorAll(selector)).slice(0, max).map((el) => lees(el, diepte));
    },
    { selector, max, diepte },
  ) as Promise<Knoop[]>;
}

/**
 * De kalender van de kinderopvang: hoe de tegels eruitzien, en wat er in het
 * venster staat dat een tegel opent. Het venster wordt meteen weer gesloten;
 * op "Inschrijven" wordt nooit geklikt.
 */
async function verkenKalender(pagina: Page, adres: string): Promise<string[]> {
  const uit: string[] = ["## Kalender kinderopvang, van dichtbij", ""];

  // Wat de pagina op de achtergrond ophaalt en wat er misloopt: enkel pad,
  // status en grootte, nooit de inhoud.
  const verkeer: string[] = [];
  pagina.on("response", (r) => {
    const soort = r.request().resourceType();
    if ((soort === "xhr" || soort === "fetch") && new URL(r.url()).hostname.endsWith("i-active.be")) {
      const soortInhoud = r.headers()["content-type"] ?? "?";
      r.body()
        .then((b) => {
          const begin = b.subarray(0, 40).toString("utf8").replace(/\s+/g, " ");
          const vorm = /^\s*[[{]/.test(begin) ? "json" : /<html|<!doctype/i.test(begin) ? "html" : "anders";
          const aantalItems = vorm === "json" ? (b.toString("utf8").match(/"(title|start)"\s*:/g) ?? []).length : 0;
          verkeer.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}, ${soortInhoud.split(";")[0]}, ${b.length} bytes, ${vorm}${aantalItems ? `, ${aantalItems} title/start-velden` : ""}`);
        })
        .catch(() => verkeer.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`));
    }
  });
  const fouten: string[] = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") fouten.push(zuiverLabel(m.text(), 120));
  });
  pagina.on("pageerror", (e) => fouten.push(zuiverLabel(String(e), 120)));

  await pagina.setViewportSize({ width: 1400, height: 1000 });
  await pagina.goto(new URL(adres, OORSPRONG).href, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(2500);
  const telTegels = () => pagina.locator("a.fc-event").count();
  uit.push(`- Tegels meteen na laden: ${await telTegels()}`);

  // Zonder activiteitgroep toont de kalender niets.
  const filter = pagina.locator("select.apex-item-select").filter({ has: pagina.locator("option", { hasText: "Opvang (inschrijvingen)" }) }).first();
  const gefilterd = await filter.selectOption({ label: "Opvang (inschrijvingen)" }).then(() => true).catch(() => false);
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(3000);
  uit.push(`- Activiteitgroep gezet: ${gefilterd ? "ja" : "nee"}, tegels daarna: ${await telTegels()}`);

  // Een maand verder, waar zeker nog open dagen zijn.
  await pagina.getByRole("button", { name: ">", exact: true }).first().click().catch(() => {});
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(3000);
  const titel = await pagina.locator(".fc-toolbar-title").first().innerText().catch(() => "?");
  uit.push(`- Maand: ${zuiverLabel(titel)}, dagen: ${await pagina.locator("td[data-date]").count()}, tegels: ${await telTegels()}`);

  uit.push("", "**Achtergrondverkeer**", "", ...verkeer.slice(-25).map((v) => `- ${v}`));
  uit.push("", "**Fouten in de browser**", "", ...(fouten.length ? fouten.slice(0, 10).map((f) => `- ${f}`) : ["- geen"]), "");

  // Een tegel met plaats: de titel begint met "Inschrijven  tot", niet met
  // "Inschrijven OP RESERVELIJST" en niet met "Inschrijven beëindigd".
  const tegels = pagina.locator("a.fc-event[title]");
  let doel = -1;
  const n = await tegels.count();
  for (let i = 0; i < n; i++) {
    const t = (await tegels.nth(i).getAttribute("title")) ?? "";
    if (/^Inschrijven\s+tot/i.test(t)) {
      doel = i;
      break;
    }
  }
  uit.push(`- Tegels met een titel: ${n}, eerste met plaats: ${doel}`);

  if (doel < 0) {
    uit.push("Geen tegel met plaats gevonden, venster niet geopend.");
    return uit;
  }

  await tegels.nth(doel).click();
  const venster = pagina.locator(".ui-dialog:visible, [role=dialog]:visible").first();
  await venster.waitFor({ state: "visible", timeout: 15_000 });
  await pagina.waitForTimeout(2000);
  const iframe = await venster.locator("iframe").first().elementHandle().catch(() => null);
  const frame = iframe ? await iframe.contentFrame() : null;
  uit.push(`### Venster na klik op een tegel`, "", `- In een iframe: ${frame ? "ja" : "nee"}`);
  if (frame) uit.push(`- Adres van het iframe: ${zuiverUrl(frame.url())}`);
  uit.push("");
  const inhoud = frame ? await leesStructuur(frame, "body", 1) : await leesStructuur(pagina, ".ui-dialog:not([style*='display: none'])", 1);
  if (inhoud[0]) uit.push("```", skelet(inhoud[0]), "```", "");

  // Sluiten zonder in te schrijven.
  const sluit = pagina.locator(".ui-dialog-titlebar-close:visible").first();
  if (await sluit.isVisible().catch(() => false)) await sluit.click();
  else await pagina.keyboard.press("Escape");
  await venster.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  uit.push(`- Venster gesloten: ${(await venster.isVisible().catch(() => false)) ? "nee" : "ja"}`);
  return uit;
}

async function wegMetCookiemelding(pagina: Page): Promise<void> {
  for (const knop of [".cc-deny", ".cc-dismiss", ".cc-allow"]) {
    const k = pagina.locator(knop).first();
    if (await k.isVisible().catch(() => false)) {
      await k.click();
      return;
    }
  }
}

async function main() {
  const inloggen = process.argv.includes("--inloggen");
  const browser = await chromium.launch(
    process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {},
  );
  // Een gewone Chrome-identiteit: "HeadlessChrome" in de user agent kan een
  // bescherming tegen bots anders laten antwoorden.
  const pagina = await browser.newPage({
    locale: "nl-BE",
    timezoneId: "Europe/Brussels",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  const verslag: string[] = [`## Verkenning i-Active (${inloggen ? "met login" : "enkel loginpagina"})`, ""];

  try {
    const antwoord = await pagina.goto(LOGIN, { waitUntil: "networkidle" });
    verslag.push(alsMarkdown(await leesPagina(pagina, antwoord?.status() ?? null)), "");

    if (inloggen) {
      const email = process.env.IACTIVE_EMAIL;
      const wachtwoord = process.env.IACTIVE_WACHTWOORD;
      if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");

      await wegMetCookiemelding(pagina);
      await pagina.fill("#P101_USERNAME", email);
      await pagina.fill("#P101_PASSWORD", wachtwoord);
      await pagina.click("#LOGIN_BUTTON");
      // APEX verstuurt het formulier en laadt een nieuwe pagina, of toont een
      // foutmelding op dezelfde pagina. Wacht op het ene of het andere.
      await Promise.race([
        pagina.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 }),
        pagina.locator(FOUTMELDING).first().waitFor({ state: "visible", timeout: 30_000 }),
      ]).catch(() => {});
      await pagina.waitForLoadState("networkidle").catch(() => {});

      const nogOpLogin = new URL(pagina.url()).pathname.endsWith("/login");
      verslag.push(`**Ingelogd:** ${nogOpLogin ? "nee, nog op de loginpagina" : "ja"}`, "");
      if (nogOpLogin) {
        const meldingen = await pagina.locator(FOUTMELDING).allInnerTexts().catch(() => []);
        const zichtbaar = meldingen.map((m) => zuiverLabel(m, 120)).filter(Boolean);
        verslag.push(`**Melding van i-Active:** ${zichtbaar.length ? zichtbaar.join(" · ") : "geen"}`, "");
        throw new Error("Inloggen lukte niet.");
      }

      const start = await leesPagina(pagina, null);
      verslag.push(alsMarkdown(start), "");

      const bezocht = new Set([pagina.url().split("?")[0]]);
      const teBezoeken = start.menu.filter((l) => veiligeLink(l, OORSPRONG));
      for (const link of teBezoeken) {
        if (bezocht.size >= MAX_PAGINAS) break;
        const sleutel = new URL(link.href, OORSPRONG).pathname;
        if (bezocht.has(OORSPRONG + sleutel)) continue;
        bezocht.add(OORSPRONG + sleutel);
        const r = await pagina.goto(new URL(link.href, OORSPRONG).href, { waitUntil: "networkidle" });
        verslag.push(alsMarkdown(await leesPagina(pagina, r?.status() ?? null)), "");
      }

      // Menu-items zonder link (zoals "Mijn kalender") navigeren via
      // JavaScript. Die klikken we aan in het navigatiemenu zelf, en enkel
      // als het label naar een overzicht klinkt.
      for (const item of start.menu.filter((l) => !l.href && veiligMenuItem(l.label))) {
        await pagina.goto(start.url, { waitUntil: "networkidle" });
        const knop = pagina.locator(".t-TreeNav, nav, [role=navigation]").getByText(item.label.trim(), { exact: true }).first();
        if (!(await knop.isVisible().catch(() => false))) {
          await pagina.click("#t_Button_navControl").catch(() => {});
        }
        await knop.click({ timeout: 10_000 });
        await pagina.waitForLoadState("networkidle").catch(() => {});
        await pagina.waitForTimeout(2000);
        const na = await leesPagina(pagina, null);
        verslag.push(alsMarkdown(na), "");

        // Het submenu dat openklapte: die pagina's enkel openen, nooit iets indienen.
        for (const link of na.menu.filter((l) => veiligeLink(l, OORSPRONG))) {
          const pad = new URL(link.href, OORSPRONG).pathname;
          if (bezocht.has(OORSPRONG + pad) || bezocht.size >= MAX_PAGINAS) continue;
          bezocht.add(OORSPRONG + pad);
          const r = await pagina.goto(new URL(link.href, OORSPRONG).href, { waitUntil: "networkidle" });
          await pagina.waitForTimeout(2000);
          verslag.push(alsMarkdown(await leesPagina(pagina, r?.status() ?? null)), "");
        }

        const kalender = na.menu.find((l) => l.href.includes("kalender-kinderopvang"));
        if (kalender) verslag.push(...(await verkenKalender(pagina, kalender.href)));
      }
    }
  } catch (fout) {
    // Enkel de melding, geen stack: daarin kan een URL met sessie-id staan.
    verslag.push(`**Gestopt:** ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }

  // Enkel in het logboek, niet in de samenvatting van de run: een logboek
  // kan je achteraf wissen zonder de hele run te verwijderen.
  console.log(verslag.join("\n"));
}

await main();
