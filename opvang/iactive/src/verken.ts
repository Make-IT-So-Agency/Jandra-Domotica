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

import { appendFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

import { alsMarkdown, veiligeLink, type Pagina } from "./verslag.ts";

const OORSPRONG = "https://sint-katelijne-waver.i-active.be";
const LOGIN = `${OORSPRONG}/ords/r/iactive01/burgerportaal/login`;
const MAX_PAGINAS = 12;

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
  const pagina = await browser.newPage({ locale: "nl-BE", timezoneId: "Europe/Brussels" });
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
      await Promise.all([
        pagina.waitForLoadState("networkidle"),
        pagina.click("#LOGIN_BUTTON"),
      ]);
      await pagina.waitForTimeout(1500);
      const nogOpLogin = await pagina.locator("#P101_PASSWORD").isVisible().catch(() => false);
      verslag.push(`**Ingelogd:** ${nogOpLogin ? "nee, nog op de loginpagina" : "ja"}`, "");
      if (nogOpLogin) throw new Error("Inloggen lukte niet.");

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
    }
  } catch (fout) {
    // Enkel de melding, geen stack: daarin kan een URL met sessie-id staan.
    verslag.push(`**Gestopt:** ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }

  const tekst = verslag.join("\n");
  console.log(tekst);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${tekst}\n`);
}

await main();
