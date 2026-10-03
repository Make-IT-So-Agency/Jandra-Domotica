import "server-only";

import { commando } from "@/lib/opvang/telegram";
import { heeftToegang } from "@/lib/opvang/toegang";

import { HULP, deadlinebericht, factuurbericht, weekbericht } from "./berichten";
import { lijstHuizen } from "./huizen";
import { dagenTussen, vandaag } from "./kalender";
import { lijstInzendingen } from "./links";
import { nazorgstand } from "./nazorg";
import { lijstOpleverpunten } from "./werf-opslag";
import { leesBouwstand } from "./opslag";
import { zetInstelling } from "./regie-opslag";
import { CHAT_SLEUTEL, laadBotstand, metHuisnaam } from "./ronde";
import { takenVoorBouw } from "./taken";
import { stuurBouwbericht } from "./telegram";
import { noteerAanvragen, toegelatenSet } from "./telegram-koppeling";
import { chatsVan, type Bouwbericht } from "./telegramregels";
import type { Huis } from "./types";

/**
 * Wat de bot van Bouw met één binnenkomend bericht doet. Enkel commando's;
 * gewone berichten in de groep laat hij met rust. Het werk zelf gebeurt in de
 * webapp: elk antwoord heeft een knop naar het juiste scherm.
 *
 * De bot geldt voor alle huizen: /week, /deadlines, /facturen en /taken
 * antwoorden met één bericht per actief huis.
 */
export async function verwerkBouwbericht(bericht: Bouwbericht, token: string, adres: string): Promise<void> {
  const cmd = commando(bericht.text);
  if (!cmd) return;
  const chat = bericht.chat.id;

  const toegelaten = await toegelatenSet();
  if (!heeftToegang(bericht, toegelaten)) {
    // Enkel op /start en /id: dan komt de vraag om toegang in de app, bij
    // Vastgoed → Telegram, waar toelaten één tik is. Alle andere berichten van
    // onbekenden: stilte.
    if (cmd === "start" || cmd === "id") {
      await noteerAanvragen(chatsVan(bericht).filter((kandidaat) => !toegelaten.has(kandidaat.id)));
      const wie = bericht.chat.type === "private" ? "Deze bot is privé." : "Deze groep heeft nog geen toegang tot de bot van Bouw.";
      await stuurBouwbericht(
        token,
        chat,
        `${wie} De vraag om toegang staat klaar in Jandra, bij Vastgoed → Telegram: daar kan je toegelaten worden.\n\n${idRegels(bericht)}`,
      );
    }
    return;
  }

  const dag = vandaag();
  /** Eén antwoord per actief huis, met de naam erboven als er meer zijn. */
  const perHuis = async (maak: (huis: Huis) => Promise<{ tekst: string; pad: string }>) => {
    const huizen = await lijstHuizen();
    if (huizen.length === 0) return stuurBouwbericht(token, chat, "Er is nog geen huis in Jandra.");
    for (const huis of huizen) {
      const { tekst, pad } = await maak(huis);
      await stuurBouwbericht(token, chat, metHuisnaam(tekst, huis.naam, huizen.length > 1), `${adres}${pad}`);
    }
  };
  switch (cmd) {
    case "start":
      await stuurBouwbericht(token, chat, `De bot van Bouw is actief.\n\n${HULP}`);
      return;
    case "help":
      await stuurBouwbericht(token, chat, HULP);
      return;
    case "id":
      await stuurBouwbericht(token, chat, idRegels(bericht));
      return;
    case "hier":
      await zetInstelling(CHAT_SLEUTEL, String(chat));
      await stuurBouwbericht(
        token,
        chat,
        "👍 Vanaf nu stuur ik mijn herinneringen naar deze chat: keuzes, facturen, actiepunten, onderhoud en garanties, wat morgen begint, en op maandag de week.",
      );
      return;
    case "week":
      await perHuis(async (huis) => ({ tekst: weekbericht((await laadBotstand(huis.id, dag)).week), pad: "/bouw/planning" }));
      return;
    case "deadlines":
      await perHuis(async (huis) => ({
        tekst: deadlinebericht((await laadBotstand(huis.id, dag)).deadlines, dag),
        pad: "/bouw/keuzes",
      }));
      return;
    case "facturen":
      await perHuis(async (huis) => ({
        tekst: factuurbericht((await laadBotstand(huis.id, dag)).teBetalen, dag),
        pad: "/bouw/geld/facturen",
      }));
      return;
    case "taken":
      await perHuis(async (huis) => ({ tekst: await takenbericht(huis, dag), pad: "/bouw" }));
      return;
    default:
      await stuurBouwbericht(token, chat, `Onbekend commando: /${cmd}\n\n${HULP}`);
  }
}

/** Wat er nog te doen is in een huis, zoals op het overzicht. */
async function takenbericht(huis: Huis, dag: string): Promise<string> {
  const [stand, { deadlines, teBetalen, actiepunten, onderhoud, garanties, partijnaam }, inzendingen, opleverpunten] = await Promise.all([
    leesBouwstand(huis),
    laadBotstand(huis.id, dag),
    lijstInzendingen(huis.id, { status: "nieuw" }),
    lijstOpleverpunten(huis.id),
  ]);
  const taken = takenVoorBouw({
    projectnaam: stand.project.projectnaam,
    verdiepingen: stand.verdiepingen,
    plannen: stand.plannen,
    partijen: stand.partijen,
    deadlines: deadlines.map((d) => ({ keuzeId: d.keuzeId, titel: d.titel, dagen: d.dagen })),
    facturen: teBetalen.map((f) => ({ factuurId: f.factuurId, wat: f.wat, dagen: f.dagen })),
    inzendingen: {
      plannen: inzendingen.filter((inzending) => inzending.soort === "plan").length,
      geld: inzendingen.filter((inzending) => inzending.soort !== "plan").length,
    },
    actiepunten: actiepunten.flatMap((punt) =>
      punt.status === "open" && punt.deadline
        ? [{ puntId: punt.id, titel: punt.titel, wie: partijnaam(punt.partij_id), dagen: dagenTussen(dag, punt.deadline) }]
        : [],
    ),
    nakijken: opleverpunten.filter((punt) => punt.status === "hersteld").length,
    ...nazorgstand(onderhoud, garanties, dag),
  });
  return taken.length === 0 ? "Niets te doen: alles staat klaar." : ["Nog te doen:", ...taken.map((taak) => `• ${taak.tekst}`)].join("\n");
}

function idRegels(bericht: Bouwbericht): string {
  const regels = [`Jouw Telegram-id: ${bericht.from?.id ?? "onbekend"}`];
  if (bericht.chat.type !== "private") regels.push(`Id van deze groep: ${bericht.chat.id}`);
  return regels.join("\n");
}
