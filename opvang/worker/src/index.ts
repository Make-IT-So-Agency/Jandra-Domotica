import type { Env } from "./env";
import { commando, roepAan, stuurBericht, verbergToken, type Bericht, type Update } from "./telegram";
import { heeftToegang, toegelatenIds } from "./toegang";
import { gelijk, webhookGeheim } from "./webhook-geheim";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!env.TELEGRAM_BOT_TOKEN) {
      return tekst("TELEGRAM_BOT_TOKEN is niet ingesteld in Cloudflare.", 500);
    }

    if (url.pathname === "/telegram" && request.method === "POST") {
      return ontvangUpdate(request, env);
    }
    if (url.pathname === "/setup" && request.method === "GET") {
      return koppelWebhook(url, env);
    }
    if (url.pathname === "/") {
      return tekst("Opvang_bot draait");
    }
    return tekst("Niet gevonden", 404);
  },
};

/**
 * Zet de webhook van de bot op deze Worker, met het geheim erbij, en toont
 * wat Telegram daarna zelf over de webhook zegt. Veilig om opnieuw te
 * draaien: het resultaat is telkens hetzelfde. Er komt geen token in het
 * antwoord.
 */
async function koppelWebhook(url: URL, env: Env): Promise<Response> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = `${url.origin}/telegram`;
  try {
    await roepAan(token, "setWebhook", {
      url: webhookUrl,
      secret_token: await webhookGeheim(token),
      allowed_updates: ["message", "callback_query"],
    });
    const info = await roepAan<Record<string, unknown>>(token, "getWebhookInfo");
    const bot = await roepAan<{ username: string }>(token, "getMe");
    return json({
      ok: true,
      bot: bot.username,
      webhook: info.url,
      wachtende_updates: info.pending_update_count,
      laatste_fout: info.last_error_message ?? null,
      toegelaten_ids_ingesteld: toegelatenIds(env.TOEGELATEN_TELEGRAM_IDS).size,
    });
  } catch (fout) {
    return json({ ok: false, fout: verbergToken(String(fout), token) }, 502);
  }
}

async function ontvangUpdate(request: Request, env: Env): Promise<Response> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const aangeboden = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!gelijk(aangeboden, await webhookGeheim(token))) {
    return tekst("Geen toegang", 401);
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  try {
    if (update?.message) await verwerkBericht(update.message, env);
  } catch (fout) {
    // Toch 200: anders blijft Telegram dezelfde update opnieuw sturen, en een
    // fout die bij de eerste keer optreedt, treedt de tiende keer ook op.
    console.error("Update niet verwerkt:", verbergToken(String(fout), token));
  }
  return tekst("ok");
}

export async function verwerkBericht(bericht: Bericht, env: Env): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const cmd = commando(bericht.text);
  if (!cmd) return;

  if (!heeftToegang(bericht, toegelatenIds(env.TOEGELATEN_TELEGRAM_IDS))) {
    // Enkel op /start en /id antwoorden, zodat een nieuwe gebruiker haar id
    // kan opvragen. Alle andere berichten van onbekenden: stilte.
    if (cmd === "start" || cmd === "id") {
      await stuurBericht(
        token,
        bericht.chat.id,
        `Deze bot is privé.\n\n${idRegels(bericht)}\n\nZet dit bij TOEGELATEN_TELEGRAM_IDS in Cloudflare om toegang te geven.`,
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

function tekst(inhoud: string, status = 200): Response {
  return new Response(inhoud, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function json(inhoud: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhoud, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
