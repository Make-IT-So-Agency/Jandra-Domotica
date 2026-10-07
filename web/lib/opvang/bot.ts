import "server-only";

import { momentLabel, opvangLabel, volgendeMomenten } from "./inschrijfmomenten";
import { ingeschrevenBericht, kinderenBericht, overzichtVan, toonMenus, volgendeRonde, vorigeRonde } from "./menu";
import * as opslag from "./opslag";
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
    case "volgende":
      await stuurBericht(token, bericht.chat.id, volgendeTekst(new Date()));
      return;
    case "help":
      await stuurBericht(token, bericht.chat.id, HULP);
      return;
    case "hier":
      await opslag.zetInstelling("telegram_chat_id", String(bericht.chat.id));
      await opslag.zetInstelling("telegram_chat_gekozen", "ja");
      await stuurBericht(
        token,
        bericht.chat.id,
        "👍 Vanaf nu stuur ik keuzemenu's, herinneringen en verslagen naar deze chat.",
      );
      return;
    case "kinderen": {
      const { tekst, knoppen } = await kinderenBericht();
      await stuurBericht(token, bericht.chat.id, tekst, knoppen);
      return;
    }
    case "plannen": {
      const ronde = await volgendeRonde();
      if (!(await opslag.kinderen()).some((k) => k.plannen)) {
        const { tekst, knoppen } = await kinderenBericht();
        await stuurBericht(token, bericht.chat.id, tekst, knoppen);
        return;
      }
      const n = await toonMenus(token, ronde.id, bericht.chat.id, true);
      if (!n) {
        await stuurBericht(
          token,
          bericht.chat.id,
          `De kalender van ${opvangLabel(ronde.maand)} is nog niet gelezen. Zodra dat gebeurd is, stuur ik het keuzemenu.`,
        );
      }
      return;
    }
    case "status": {
      // Eerst hoe de vorige ronde afliep: "is het gelukt?" moet je hier kunnen vragen.
      const vorige = await vorigeRonde();
      const ronde = await volgendeRonde();
      const { tekst, aantal } = await overzichtVan(ronde);
      await stuurBericht(
        token,
        bericht.chat.id,
        [
          ...(vorige && vorige.id !== ronde.id ? [`Vorige: ${vorige.tekst}`, ""] : []),
          `Opvang ${opvangLabel(ronde.maand)}, opent ${momentLabel(new Date(ronde.opent))}`,
          `Status: ${ronde.status}${ronde.definitief_door ? ` (definitief door ${ronde.definitief_door})` : ""}`,
          `Gekozen: ${aantal}`,
          ...(aantal ? ["", tekst] : []),
        ].join("\n"),
      );
      return;
    }
    case "ingeschreven":
      await stuurBericht(token, bericht.chat.id, await ingeschrevenBericht());
      return;
    case "stop": {
      const lopend = (await opslag.lopendeRondes()).filter((r) => r.status === "bezig" || r.status === "definitief");
      for (const r of lopend) await opslag.werkRondeBij(r.id, { stop_gevraagd: true });
      await stuurBericht(
        token,
        bericht.chat.id,
        lopend.length
          ? "🛑 Begrepen. Ik stop vóór het volgende slot en meld wat al gebeurd is. Opnieuw starten: druk op ✏️ Wijzigen en daarna op Definitief."
          : "Er loopt niets om te stoppen.",
      );
      return;
    }
    default:
      await stuurBericht(token, bericht.chat.id, `Onbekend commando: /${cmd}`);
  }
}

const HULP = [
  "/plannen: toon het keuzemenu van de volgende inschrijving",
  "/status: of de vorige inschrijving gelukt is, wat er nu gekozen is, en of het definitief is",
  "/ingeschreven: wat er volgens i-Active effectief ingeschreven is",
  "/kinderen: voor wie ik opvang reserveer",
  "/stop: stop een inschrijving die bezig is",
  "/volgende: de volgende inschrijfmomenten",
  "/hier: stuur mijn berichten voortaan naar deze chat",
  "/id: je Telegram-id",
].join("\n");

function idRegels(bericht: Bericht): string {
  const regels = [`Jouw Telegram-id: ${bericht.from?.id ?? "onbekend"}`];
  if (bericht.chat.type !== "private") regels.push(`Id van deze groep: ${bericht.chat.id}`);
  return regels.join("\n");
}

/** De eerstvolgende openingen voor inwoners, en de tweede ronde die eerder valt. */
export function volgendeTekst(nu: Date): string {
  const regels = ["Volgende inschrijvingen BKO (inwoners):"];
  for (const m of volgendeMomenten("inwoners", nu, 2)) {
    const onzeker = m.bron === "berekend" ? " (berekend, nog niet officieel)" : "";
    regels.push(`${momentLabel(m.opent)} voor ${opvangLabel(m.opvang)}${onzeker}`);
  }
  const [tweede] = volgendeMomenten("tweede_ronde", nu);
  if (tweede) regels.push("", `Tweede ronde: ${momentLabel(tweede.opent)} voor ${opvangLabel(tweede.opvang)}`);
  return regels.join("\n");
}
