"use server";

import { adresVanApp } from "@/lib/bouw/adres";
import { tekst } from "@/lib/bouw/invoer";
import { stuurBouwbericht } from "@/lib/bouw/telegram";
import {
  botMagHier,
  koppelBot,
  laatToe,
  leesBottoken,
  leesToegang,
  ontkoppelBot,
  trekIn,
  vergeetAanvraag,
  zetHerinneringenChat,
} from "@/lib/bouw/telegram-koppeling";
import { leesTelegramId, type Telegramchat } from "@/lib/bouw/telegramregels";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { verbergToken } from "@/lib/opvang/telegram";
import { vereistBouwrechten } from "@/lib/toegang";

const PAD = "/bouw/telegram";

/** Een preview deelt de databank met productie: daar blijft de bot met rust. */
function enkelHier(): void {
  if (!botMagHier()) terug(PAD, "fout", "Dit is een testversie van de app: de bot beheer je in de gewone app.");
}

function chatId(formulier: FormData, veld = "chat_id"): number | null {
  return leesTelegramId(String(formulier.get(veld) ?? ""));
}

/** Een bericht van de bot. Mislukt het, dan geeft het de reden, voor de melding. */
async function stuur(chat: number, bericht: string, url?: string): Promise<string | null> {
  const token = await leesBottoken();
  if (!token) return null;
  try {
    await stuurBouwbericht(token, chat, bericht, url);
    return null;
  } catch (fout) {
    return verbergToken(foutmelding(fout, "onbekende fout"), token);
  }
}

export async function koppelActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const uitkomst = await koppelBot(String(formulier.get("token") ?? ""));
  if (!uitkomst.ok) terug(PAD, "fout", uitkomst.melding);
  terug(PAD, "goed", `Gekoppeld met @${uitkomst.bot}. Open de bot in Telegram en tik op Start: je vraag om toegang verschijnt dan hier.`);
}

export async function opnieuwKoppelenActie(): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  let token: string | null = null;
  try {
    token = await leesBottoken();
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Lezen mislukt."));
  }
  if (!token) terug(PAD, "fout", "Er is geen leesbaar token: plak het opnieuw.");
  const uitkomst = await koppelBot(token);
  if (!uitkomst.ok) terug(PAD, "fout", uitkomst.melding);
  terug(PAD, "goed", "Opnieuw gekoppeld: de webhook en de commando's staan weer goed.");
}

export async function testberichtActie(): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  let probleem: string | null;
  try {
    const { chat } = await leesToegang();
    if (!chat) {
      probleem = "Kies eerst een chat voor de herinneringen.";
    } else if (!(await leesBottoken())) {
      probleem = "De bot is niet gekoppeld.";
    } else {
      const reden = await stuur(chat, "👋 Een testbericht van de bot van Bouw: hier komen de herinneringen.", `${await adresVanApp()}/bouw`);
      probleem = reden ? `Niet verstuurd: ${reden}` : null;
    }
  } catch (fout) {
    probleem = foutmelding(fout, "Versturen mislukt.");
  }
  if (probleem) terug(PAD, "fout", probleem);
  terug(PAD, "goed", "Testbericht verstuurd: kijk in Telegram.");
}

export async function ontkoppelActie(): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  try {
    await ontkoppelBot();
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Ontkoppelen mislukt."));
  }
  terug(PAD, "goed", "Ontkoppeld. Wie toegelaten was, blijft dat, ook voor een volgende bot.");
}

export async function toelatenActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const gevraagd = chatId(formulier);
  if (!gevraagd) terug(PAD, "fout", "Onbekende aanvraag.");
  const herinneringen = formulier.get("herinneringen") === "ja";
  let chat: Telegramchat | undefined;
  let probleem: string | null = null;
  try {
    chat = (await leesToegang()).aanvragen.find((aanvraag) => aanvraag.id === gevraagd);
    if (chat) {
      await laatToe(chat);
      if (herinneringen) await zetHerinneringenChat(chat.id);
      // Een welkom in Telegram: zo blijkt meteen dat het werkt.
      probleem = await stuur(
        chat.id,
        chat.soort === "groep"
          ? `👋 Deze groep kan de bot van Bouw nu gebruiken.${herinneringen ? " Hier komen voortaan de herinneringen." : ""} /help toont wat ik kan.`
          : "👋 Welkom! Je kan de bot van Bouw nu gebruiken. /help toont wat ik kan.",
      );
    }
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toelaten mislukt."));
  }
  if (!chat) terug(PAD, "fout", "Deze aanvraag bestaat niet meer.");
  terug(
    PAD,
    "goed",
    `${chat.naam} is toegelaten${herinneringen ? ", met de herinneringen" : ""}.${probleem ? ` Maar de bot kon er geen bericht sturen: ${probleem}` : ""}`,
  );
}

export async function vergeetAanvraagActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const gevraagd = chatId(formulier);
  if (!gevraagd) terug(PAD, "fout", "Onbekende aanvraag.");
  try {
    await vergeetAanvraag(gevraagd);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Negeren mislukt."));
  }
  terug(PAD, "goed", "Aanvraag genegeerd.");
}

export async function intrekkenActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const gekozen = chatId(formulier);
  if (!gekozen) terug(PAD, "fout", "Onbekende chat.");
  try {
    await trekIn(gekozen);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Intrekken mislukt."));
  }
  terug(PAD, "goed", "Toegang ingetrokken.");
}

export async function herinneringenHierActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const gekozen = chatId(formulier);
  if (!gekozen) terug(PAD, "fout", "Onbekende chat.");
  let chat: Telegramchat | undefined;
  let probleem: string | null = null;
  try {
    chat = (await leesToegang()).toegelaten.find((toegelaten) => toegelaten.id === gekozen);
    if (chat) {
      await zetHerinneringenChat(chat.id);
      probleem = await stuur(chat.id, "👍 Vanaf nu stuur ik mijn herinneringen naar deze chat.");
    }
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  if (!chat) terug(PAD, "fout", "Laat deze chat eerst toe.");
  terug(PAD, "goed", `De herinneringen gaan nu naar ${chat.naam}.${probleem ? ` Maar de bot kon er geen bericht sturen: ${probleem}` : ""}`);
}

export async function idToevoegenActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  enkelHier();
  const gekozen = chatId(formulier, "telegram_id");
  if (!gekozen) terug(PAD, "fout", "Een Telegram-id is een getal; dat van een groep begint met een minteken.");
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(PAD, "fout", "Geef een naam, zodat je later weet wie het is.");
  const soort = formulier.get("soort") === "groep" || gekozen < 0 ? "groep" : "persoon";
  try {
    await laatToe({ id: gekozen, naam: naam.slice(0, 80), soort });
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(PAD, "goed", `${naam} is toegelaten.`);
}
