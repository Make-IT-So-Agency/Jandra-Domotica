import "server-only";

import { lookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

import { isPubliekAdres, schoonAdres } from "./materiaal-pagina";

/**
 * Een pagina of foto van een andere site ophalen, voor een materiaal: enkel
 * van het openbare internet. Elk adres wordt opgezocht en nagekeken vóór er
 * verbinding komt, ook na een doorverwijzing: zo kan een geplakt adres nooit
 * bij een dienst binnen het netwerk van de server komen (localhost, een eigen
 * netwerk, de metadata van een cloud). Met een grens op de grootte en de tijd.
 * Enkel op de server.
 */

export class Ophaalfout extends Error {}

export interface Opgehaald {
  /** Het adres na de doorverwijzingen. */
  url: string;
  /** Het type dat de site opgeeft, in kleine letters en zonder ;charset. */
  type: string;
  inhoud: Buffer;
}

const DOORVERWIJZINGEN = 4;

/** Zoekt een naam op en weigert ze als één van haar adressen niet openbaar is. */
const openbaarOpzoeken: LookupFunction = (naam, opties, klaar) => {
  lookup(naam, { all: true, verbatim: true }, (fout, adressen: LookupAddress[]) => {
    if (fout) return klaar(fout, "", 4);
    const lijst = adressen ?? [];
    if (lijst.length === 0 || lijst.some((a) => !isPubliekAdres(a.address))) {
      return klaar(new Ophaalfout("Dit adres ligt niet op het openbare internet."), "", 4);
    }
    // Node vraagt soms alle adressen (bij autoSelectFamily), soms één.
    if ((opties as { all?: boolean }).all) return (klaar as unknown as (f: null, a: LookupAddress[]) => void)(null, lijst);
    klaar(null, lijst[0].address, lijst[0].family);
  });
};

/** Eén verzoek, zonder doorverwijzing te volgen. */
function verzoek(url: URL, maxBytes: number, tijd: number): Promise<{ status: number; locatie: string | null; type: string; inhoud: Buffer }> {
  return new Promise((gelukt, mislukt) => {
    const module = url.protocol === "https:" ? https : http;
    const aanvraag = module.request(
      url,
      {
        method: "GET",
        lookup: openbaarOpzoeken,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; Jandra-materialen/1.0)",
          accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
          "accept-language": "nl-BE,nl;q=0.9,en;q=0.6",
        },
        timeout: tijd,
      },
      (antwoord) => {
        const status = antwoord.statusCode ?? 0;
        const locatie = typeof antwoord.headers.location === "string" ? antwoord.headers.location : null;
        const type = String(antwoord.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (status >= 300 && status < 400) {
          antwoord.resume();
          return gelukt({ status, locatie, type, inhoud: Buffer.alloc(0) });
        }
        const lengte = Number(antwoord.headers["content-length"]);
        if (Number.isFinite(lengte) && lengte > maxBytes) {
          antwoord.destroy();
          return mislukt(new Ophaalfout("Dit bestand is te groot."));
        }
        const stukken: Buffer[] = [];
        let samen = 0;
        antwoord.on("data", (stuk: Buffer) => {
          samen += stuk.length;
          if (samen > maxBytes) {
            antwoord.destroy();
            mislukt(new Ophaalfout("Dit bestand is te groot."));
            return;
          }
          stukken.push(stuk);
        });
        antwoord.on("end", () => gelukt({ status, locatie, type, inhoud: Buffer.concat(stukken) }));
        antwoord.on("error", mislukt);
      },
    );
    // `timeout` geldt per stilte op de verbinding; dit is de grens voor het geheel.
    const wekker = setTimeout(() => aanvraag.destroy(new Ophaalfout("De site antwoordt niet op tijd.")), tijd * 2);
    aanvraag.on("close", () => clearTimeout(wekker));
    aanvraag.on("timeout", () => aanvraag.destroy(new Ophaalfout("De site antwoordt niet op tijd.")));
    aanvraag.on("error", mislukt);
    aanvraag.end();
  });
}

/**
 * Haalt een adres op, en volgt hoogstens vier doorverwijzingen. Elk adres
 * moet http of https zijn, op de gewone poort, en openbaar. Geeft een
 * Ophaalfout met een Nederlandse uitleg als het niet lukt.
 */
export async function haalOp(adres: string, opties: { maxBytes: number; tijd?: number }): Promise<Opgehaald> {
  const tijd = opties.tijd ?? 10_000;
  let url = schoonAdres(adres);
  for (let stap = 0; stap <= DOORVERWIJZINGEN; stap++) {
    if (!url) throw new Ophaalfout("Dit is geen geldig adres van een site.");
    // Een IP-adres in het adres zelf zoekt Node niet op: dat kijken we hier na.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPubliekAdres(host)) throw new Ophaalfout("Dit adres ligt niet op het openbare internet.");
    let antwoord: Awaited<ReturnType<typeof verzoek>>;
    try {
      antwoord = await verzoek(url, opties.maxBytes, tijd);
    } catch (fout) {
      if (fout instanceof Ophaalfout) throw fout;
      throw new Ophaalfout("Deze site is niet te bereiken.");
    }
    if (antwoord.status >= 300 && antwoord.status < 400) {
      url = antwoord.locatie ? schoonAdres(new URL(antwoord.locatie, url).toString()) : null;
      continue;
    }
    if (antwoord.status !== 200) throw new Ophaalfout(`De site antwoordt met fout ${antwoord.status}.`);
    return { url: url.toString(), type: antwoord.type, inhoud: antwoord.inhoud };
  }
  throw new Ophaalfout("Te veel doorverwijzingen.");
}
