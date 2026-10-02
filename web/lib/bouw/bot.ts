import "server-only";

import { commando, type Bericht } from "@/lib/opvang/telegram";
import { heeftToegang, toegelatenIds } from "@/lib/opvang/toegang";

import { HULP, deadlinebericht, factuurbericht, weekbericht } from "./berichten";
import { dagenTussen, vandaag } from "./kalender";
import { lijstInzendingen } from "./links";
import { leesBouwstand } from "./opslag";
import { zetInstelling } from "./regie-opslag";
import { CHAT_SLEUTEL, laadBotstand } from "./ronde";
import { takenVoorBouw } from "./taken";
import { stuurBouwbericht } from "./telegram";

/**
 * Wat de bot van Bouw met één binnenkomend bericht doet. Enkel commando's;
 * gewone berichten in de groep laat hij met rust. Het werk zelf gebeurt in de
 * webapp: elk antwoord heeft een knop naar het juiste scherm.
 */
export async function verwerkBouwbericht(bericht: Bericht, token: string, adres: string): Promise<void> {
  const cmd = commando(bericht.text);
  if (!cmd) return;
  const chat = bericht.chat.id;

  if (!heeftToegang(bericht, toegelatenIds(process.env.BOUW_TOEGELATEN_TELEGRAM_IDS))) {
    // Enkel op /start en /id antwoorden, zodat een nieuwe gebruiker haar id
    // kan opvragen. Alle andere berichten van onbekenden: stilte.
    if (cmd === "start" || cmd === "id") {
      await stuurBouwbericht(
        token,
        chat,
        `Deze bot is privé.\n\n${idRegels(bericht)}\n\nZet dit bij BOUW_TOEGELATEN_TELEGRAM_IDS in GitHub om toegang te geven.`,
      );
    }
    return;
  }

  const dag = vandaag();
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
        "👍 Vanaf nu stuur ik de herinneringen voor de keuzes en de facturen, wat morgen begint en op maandag de week naar deze chat.",
      );
      return;
    case "week": {
      const { week } = await laadBotstand(dag);
      await stuurBouwbericht(token, chat, weekbericht(week), `${adres}/bouw/planning`);
      return;
    }
    case "deadlines": {
      const { deadlines } = await laadBotstand(dag);
      await stuurBouwbericht(token, chat, deadlinebericht(deadlines, dag), `${adres}/bouw/keuzes`);
      return;
    }
    case "facturen": {
      const { teBetalen } = await laadBotstand(dag);
      await stuurBouwbericht(token, chat, factuurbericht(teBetalen, dag), `${adres}/bouw/geld/facturen`);
      return;
    }
    case "taken": {
      const [stand, { deadlines, teBetalen, actiepunten, partijnaam }, inzendingen] = await Promise.all([
        leesBouwstand(),
        laadBotstand(dag),
        lijstInzendingen({ status: "nieuw" }),
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
      });
      await stuurBouwbericht(
        token,
        chat,
        taken.length === 0 ? "Niets te doen: alles staat klaar." : ["Nog te doen:", ...taken.map((taak) => `• ${taak.tekst}`)].join("\n"),
        `${adres}/bouw`,
      );
      return;
    }
    default:
      await stuurBouwbericht(token, chat, `Onbekend commando: /${cmd}\n\n${HULP}`);
  }
}

function idRegels(bericht: Bericht): string {
  const regels = [`Jouw Telegram-id: ${bericht.from?.id ?? "onbekend"}`];
  if (bericht.chat.type !== "private") regels.push(`Id van deze groep: ${bericht.chat.id}`);
  return regels.join("\n");
}
