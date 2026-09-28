/**
 * Van een pagina in i-Active naar een verslag zonder persoonsgegevens.
 *
 * De repository is publiek, en dus ook de logboeken van haar workflows. Wat
 * hier uitkomt, mag iedereen lezen. Daarom komt er enkel structuur in: welke
 * pagina, welke velden en knoppen, welke menu-items, welke kolomkoppen. Nooit
 * vrije tekst van een pagina, nooit een waarde uit een veld, nooit een
 * sessie-id.
 */

export interface Veld {
  tag: string;
  type: string;
  id: string;
  naam: string;
}

export interface Knop {
  id: string;
  label: string;
}

export interface Link {
  label: string;
  href: string;
}

export interface Pagina {
  url: string;
  status: number | null;
  titel: string;
  velden: Veld[];
  knoppen: Knop[];
  menu: Link[];
  kolomkoppen: string[];
  aantalRegio: number;
  aantalTabelrijen: number;
  signalen: string[];
}

/** Oorsprong en pad, en van de query enkel de namen. Sessie-id's verdwijnen zo vanzelf. */
export function zuiverUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "<geen geldige url>";
  }
  const namen = [...new Set(u.searchParams.keys())];
  // Oude APEX-adressen dragen alles in p=app:pagina:sessie:...
  const p = u.searchParams.get("p");
  const apex = p ? ` (app ${p.split(":")[0]}, pagina ${p.split(":")[1] ?? "?"})` : "";
  return `${u.origin}${u.pathname}${namen.length ? `?${namen.join("&")}` : ""}${apex}`;
}

/**
 * Een label van een knop, menu-item of kolomkop. Kort, en zonder wat op een
 * e-mailadres, een rijksregisternummer of een ander lang getal lijkt.
 */
export function zuiverLabel(tekst: string): string {
  return tekst
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\s@]+@[^\s@]+/g, "<e-mail>")
    .replace(/\d[\d.\-/ ]{5,}\d/g, "<getal>")
    .slice(0, 40);
}

const GEVAARLIJK =
  /annul|verwijder|wis\b|schrap|uitschrijv|afmeld|uitlog|logout|betaal|bevestig|checkout|afrekenen|winkelmand|delete|opslaan|bewaar|registr/i;

/**
 * Of de verkenning een menu-item mag volgen. Enkel gewone links binnen
 * i-Active, en niets dat naar iets onomkeerbaars klinkt. Knoppen worden nooit
 * aangeklikt; dit gaat enkel over links.
 */
export function veiligeLink(link: Link, oorsprong: string): boolean {
  if (!link.href || link.href.startsWith("javascript:") || link.href.startsWith("#")) return false;
  if (GEVAARLIJK.test(link.label) || GEVAARLIJK.test(link.href)) return false;
  try {
    return new URL(link.href, oorsprong).origin === oorsprong;
  } catch {
    return false;
  }
}

export function alsMarkdown(pagina: Pagina): string {
  const regels = [
    `### ${zuiverUrl(pagina.url)}`,
    "",
    `- HTTP-status: ${pagina.status ?? "onbekend"}`,
    `- Titel: ${zuiverLabel(pagina.titel)}`,
    `- Regio's: ${pagina.aantalRegio}, tabelrijen: ${pagina.aantalTabelrijen}`,
  ];
  if (pagina.signalen.length) regels.push(`- Signalen: ${pagina.signalen.join(", ")}`);
  if (pagina.menu.length) {
    regels.push("", "**Menu**", "");
    for (const l of pagina.menu) regels.push(`- ${zuiverLabel(l.label) || "(zonder label)"} → ${zuiverUrl(l.href)}`);
  }
  if (pagina.velden.length) {
    regels.push("", "**Velden**", "", "| tag | type | id | naam |", "| --- | --- | --- | --- |");
    for (const v of pagina.velden) regels.push(`| ${v.tag} | ${v.type} | ${v.id} | ${v.naam} |`);
  }
  if (pagina.knoppen.length) {
    regels.push("", "**Knoppen**", "");
    for (const k of pagina.knoppen) regels.push(`- \`${k.id || "(geen id)"}\` ${zuiverLabel(k.label)}`);
  }
  if (pagina.kolomkoppen.length) {
    regels.push("", `**Kolomkoppen:** ${pagina.kolomkoppen.map(zuiverLabel).join(" · ")}`);
  }
  return regels.join("\n");
}
