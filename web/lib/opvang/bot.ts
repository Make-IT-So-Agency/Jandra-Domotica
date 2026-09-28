import "server-only";

import { commando, stuurBericht, type Bericht } from "./telegram";
import { heeftToegang, toegelatenIds } from "./toegang";

/** Wat de bot met één binnenkomend bericht doet. */
export async function verwerkBericht(bericht: Bericht, token: string): Promise<void> {
  const cmd = commando(bericht.text);
  if (!cmd) return;

  if (!heeftToegang(bericht, toegelatenIds(process.env.TOEGELATEN_TELEGRAM_IDS))) {
    // Enkel op /start en /id antwoorden, zodat een nieuwe gebruiker haar id
    // kan opvragen. Alle andere berichten van onbekenden: stilte.
    if (cmd === "start" || cmd === "id") {
      await stuurBericht(
        token,
        bericht.chat.id,
        `Deze bot is privé.\n\n${idRegels(bericht)}\n\nZet dit bij TOEGELATEN_TELEGRAM_IDS in GitHub om toegang te geven.`,
      );
    }
    return;
  }

  switch (cmd) {
    case "start":
      await stuurBericht(token, bericht.chat.id, "Opvang_bot is actief");
      return;
    case "id":
      await stuurBericht(token, bericht.chat.id, idRegels(bericht));
      return;
    default:
      await stuurBericht(token, bericht.chat.id, `Onbekend commando: /${cmd}`);
  }
}

function idRegels(bericht: Bericht): string {
  const regels = [`Jouw Telegram-id: ${bericht.from?.id ?? "onbekend"}`];
  if (bericht.chat.type !== "private") regels.push(`Id van deze groep: ${bericht.chat.id}`);
  return regels.join("\n");
}
