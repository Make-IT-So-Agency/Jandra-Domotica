/** De HTML-structuur van een stuk pagina, met alle tekst en attributen gemaskeerd. */

import type { Frame, Page } from "playwright";

import { zuiverLabel, zuiverUrl } from "./verslag.ts";

export interface Knoop {
  tag: string;
  id: string;
  klassen: string;
  attributen: Record<string, string>;
  tekst: string;
  kinderen: Knoop[];
}

/** De HTML-structuur van een element, met tekst en attributen gemaskeerd. */
export function skelet(knoop: Knoop, inspringing = ""): string {
  const attrs = Object.entries(knoop.attributen)
    .map(([k, v]) => ` ${k}="${k === "href" ? zuiverUrl(v) : zuiverLabel(v, 60)}"`)
    .join("");
  const kop = `${inspringing}<${knoop.tag}${knoop.id ? ` id="${zuiverLabel(knoop.id, 60)}"` : ""}${knoop.klassen ? ` class="${knoop.klassen}"` : ""}${attrs}>`;
  const tekst = knoop.tekst ? ` "${zuiverLabel(knoop.tekst, 60)}"` : "";
  return [kop + tekst, ...knoop.kinderen.map((k) => skelet(k, inspringing + "  "))].join("\n");
}

/** Leest de structuur van elementen in de pagina (of een frame), tot een bepaalde diepte. */
export async function leesStructuur(doel: Page | Frame, selector: string, max: number, diepte = 6): Promise<Knoop[]> {
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

