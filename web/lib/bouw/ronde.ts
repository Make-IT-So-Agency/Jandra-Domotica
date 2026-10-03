import "server-only";

import { herinneringen, type Openstaand } from "./berichten";
import { factuurherinneringen, factuurWat, openFacturen } from "./geld";
import { lijstFacturen } from "./geld-opslag";
import { lijstHuizen } from "./huizen";
import { actiepuntherinneringen } from "./werf";
import { lijstActiepunten } from "./werf-opslag";
import { vandaag } from "./kalender";
import { openDeadlines } from "./keuzes";
import { nazorgherinneringen } from "./nazorg";
import { lijstGaranties, lijstOnderhoud } from "./nazorg-opslag";
import { lijstPartijen } from "./opslag";
import { tweeWeken } from "./planning";
import { leesInstelling, lijstKeuzes, lijstPlanning, meldEenKeer, vergeetMelding } from "./regie-opslag";
import { stuurBouwbericht } from "./telegram";
import { CHAT_SLEUTEL } from "./telegramregels";

/**
 * De dagelijkse ronde van de bot van Bouw, en wat de commando's nodig hebben.
 * Vercel roept de ronde elke ochtend aan via /api/cron/bouw.
 *
 * De bot en zijn chat gelden voor alle huizen. De ronde loopt over de actieve
 * huizen; zijn er meer, dan staat de naam van het huis boven elk bericht.
 */

/** In bouw_instellingen: de chat waar de bot zijn herinneringen heen stuurt, gekozen in de app of met /hier. */
export { CHAT_SLEUTEL };

export async function laadBotstand(huisId: number, dag: string) {
  const [keuzes, planning, partijen, facturen, actiepunten, onderhoud, garanties] = await Promise.all([
    lijstKeuzes(huisId),
    lijstPlanning(huisId),
    lijstPartijen(huisId),
    lijstFacturen(huisId),
    lijstActiepunten(huisId),
    lijstOnderhoud(huisId),
    lijstGaranties(huisId),
  ]);
  const open = openDeadlines(keuzes, planning, dag);
  const deadlines: Openstaand[] = open.map(({ keuze, deadline, dagen }) => ({
    keuzeId: keuze.id,
    titel: keuze.titel,
    datum: deadline.datum,
    dagen,
  }));
  const namen = new Map(partijen.map((partij) => [partij.id, partij.naam]));
  const partijnaam = (partijId: number | null) => (partijId === null ? null : (namen.get(partijId) ?? null));
  return {
    deadlines,
    facturen,
    actiepunten,
    onderhoud,
    garanties,
    partijnaam,
    /** De facturen die nog betaald moeten worden, de eerste vervaldag eerst. */
    teBetalen: openFacturen(facturen, dag).map(({ factuur, vervaldag, dagen }) => ({
      factuurId: factuur.id,
      wat: factuurWat(factuur, partijnaam(factuur.partij_id)),
      vervaldag,
      dagen,
    })),
    planning: planning.map((item) => ({
      id: item.id,
      soort: item.soort,
      titel: item.titel,
      begindatum: item.begindatum,
      status: item.status,
      partij: item.partij_id ? (namen.get(item.partij_id) ?? null) : null,
    })),
    week: tweeWeken(planning, deadlines.map((d) => ({ titel: d.titel, datum: d.datum })), dag),
  };
}

export interface Rondeverslag {
  verstuurd: number;
  alGemeld: number;
  reden?: string;
}

/** Met meer dan één huis staat de naam van het huis boven het bericht. */
export function metHuisnaam(tekst: string, huisnaam: string, meerHuizen: boolean): string {
  return meerHuizen ? `🏠 ${huisnaam}\n${tekst}` : tekst;
}

export async function dagelijkseRonde(token: string, nu: Date, adres: string): Promise<Rondeverslag> {
  const chat = Number(await leesInstelling(CHAT_SLEUTEL));
  if (!Number.isSafeInteger(chat) || chat === 0) {
    return { verstuurd: 0, alGemeld: 0, reden: "Nog geen chat gekozen: kies er een bij Vastgoed → Telegram, of stuur /hier in de groep." };
  }

  const dag = vandaag(nu);
  const huizen = await lijstHuizen();
  let verstuurd = 0;
  let alGemeld = 0;
  // Elk huis apart: wat bij het ene misloopt, houdt het andere niet tegen.
  let eersteFout: unknown = null;
  for (const huis of huizen) {
    try {
      const stand = await laadBotstand(huis.id, dag);
      const teMelden = [
        ...herinneringen(huis.id, stand.deadlines, stand.planning, stand.week, dag),
        ...factuurherinneringen(stand.facturen, stand.partijnaam, dag),
        ...actiepuntherinneringen(stand.actiepunten, stand.partijnaam, dag),
        ...nazorgherinneringen(stand.onderhoud, stand.garanties, stand.partijnaam, dag),
      ];
      for (const herinnering of teMelden) {
        if (!(await meldEenKeer(herinnering.sleutel))) {
          alGemeld++;
          continue;
        }
        try {
          await stuurBouwbericht(
            token,
            chat,
            metHuisnaam(herinnering.tekst, huis.naam, huizen.length > 1),
            `${adres}${herinnering.pad}`,
          );
          verstuurd++;
        } catch (fout) {
          // Niet gelukt: de volgende ronde mag het opnieuw proberen.
          await vergeetMelding(herinnering.sleutel).catch(() => undefined);
          throw fout;
        }
      }
    } catch (fout) {
      eersteFout ??= fout;
    }
  }
  if (eersteFout) throw eersteFout;
  return { verstuurd, alGemeld };
}
