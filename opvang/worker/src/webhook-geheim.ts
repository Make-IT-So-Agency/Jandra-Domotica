/**
 * Telegram stuurt bij elke webhook-aanroep het geheim mee dat we bij
 * setWebhook opgaven, in de header X-Telegram-Bot-Api-Secret-Token. Zonder
 * die controle kan iedereen die de URL kent zich als Telegram voordoen.
 *
 * Het geheim wordt afgeleid van het bot-token in plaats van apart ingesteld:
 * één secret minder om te beheren, en wie het token vervangt, krijgt vanzelf
 * een nieuw geheim zodra /setup opnieuw draait.
 */
export async function webhookGeheim(token: string): Promise<string> {
  const sleutel = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const handtekening = await crypto.subtle.sign(
    "HMAC",
    sleutel,
    new TextEncoder().encode("opvang-bot:telegram-webhook"),
  );
  // Hex: Telegram laat enkel A-Z, a-z, 0-9, _ en - toe.
  return [...new Uint8Array(handtekening)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}
