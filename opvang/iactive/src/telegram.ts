/**
 * Berichten naar Telegram vanuit de workflow. Het token staat in de URL van
 * elke aanroep, dus een fout toont enkel wat er na het wegwerken van het
 * token overblijft.
 */

import { rest } from "./supabase.ts";

/** De chat waarin de bot praat, zoals de webapp ze bewaarde (met /hier, of de groep). */
export async function leesChat(): Promise<number | null> {
  const [rij] = await rest<{ waarde: string }[]>("GET", "opvang_instellingen?sleutel=eq.telegram_chat_id");
  return rij && Number.isSafeInteger(Number(rij.waarde)) ? Number(rij.waarde) : null;
}

export async function stuur(chatId: number, tekst: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ontbreekt.");
  // Telegram laat 4096 tekens toe per bericht; een lang verslag wordt in stukken gestuurd.
  for (const stuk of stukken(tekst, 3900)) {
    let fout = "";
    for (let poging = 0; poging < 3; poging++) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: stuk }),
        });
        const inhoud = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
        if (inhoud?.ok) {
          fout = "";
          break;
        }
        fout = inhoud?.description ?? `HTTP ${r.status}`;
      } catch (e) {
        fout = String(e);
      }
      await new Promise((ok) => setTimeout(ok, 1000 * (poging + 1)));
    }
    if (fout) throw new Error(`Telegram: ${fout.split(token).join("<token>").slice(0, 200)}`);
  }
}

export function stukken(tekst: string, max: number): string[] {
  const uit: string[] = [];
  let huidig = "";
  for (const regel of tekst.split("\n")) {
    if (huidig && huidig.length + regel.length + 1 > max) {
      uit.push(huidig);
      huidig = "";
    }
    huidig = huidig ? `${huidig}\n${regel}` : regel;
  }
  if (huidig) uit.push(huidig);
  return uit;
}
