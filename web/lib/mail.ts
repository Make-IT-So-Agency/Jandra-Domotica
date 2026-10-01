import "server-only";

/**
 * Mail versturen via Resend.
 *
 * Rechtstreeks op hun REST-API en niet via hun pakket: het is één POST, en een
 * afhankelijkheid minder is er een minder om bij te houden.
 *
 * Verzenden staat uit zolang RESEND_API_KEY ontbreekt. Dat is met opzet: de
 * code kan dan uitgerold worden zonder dat er meteen post vertrekt, en je zet
 * het aan door het geheim in te vullen. `mailStaatAan()` zegt welke van de twee
 * het is, zodat een taak het verschil kan melden tussen "niets te versturen" en
 * "versturen staat uit".
 */

const EINDPUNT = "https://api.resend.com/emails";

export interface Bijlage {
  bestandsnaam: string;
  inhoud: Buffer;
}

export interface Mail {
  aan: string;
  onderwerp: string;
  tekst: string;
  antwoordNaar?: string | null;
  bijlagen?: Bijlage[];
}

export function mailStaatAan(): boolean {
  return Boolean(process.env.RESEND_API_KEY && afzender());
}

function afzender(): string | null {
  const waarde = process.env.MAIL_AFZENDER?.trim();
  return waarde ? waarde : null;
}

/**
 * Een adres dat er op het eerste gezicht uitziet als een e-mailadres.
 *
 * Bewust ruim: streng filteren op wat een geldig adres is levert vooral
 * valse afwijzingen op. Dit vangt de echte gevallen -- een leeg veld, een
 * naam die iemand in het e-mailvakje getypt heeft -- zodat de taak dat als
 * "geen adres" meldt in plaats van het aan Resend te geven en een fout terug
 * te krijgen.
 */
export function lijktEenAdres(waarde: string | null | undefined): boolean {
  const adres = (waarde ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres);
}

/** Verstuurt de mail en geeft het bericht-id van Resend terug. */
export async function verstuurMail(mail: Mail): Promise<string> {
  const sleutel = process.env.RESEND_API_KEY;
  const van = afzender();
  if (!sleutel || !van) {
    throw new Error(
      "Versturen staat uit: RESEND_API_KEY of MAIL_AFZENDER is niet ingesteld.",
    );
  }
  if (!lijktEenAdres(mail.aan)) {
    throw new Error(`Geen bruikbaar e-mailadres: ${mail.aan || "leeg"}`);
  }

  const antwoord = await fetch(EINDPUNT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sleutel}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: van,
      to: [mail.aan],
      subject: mail.onderwerp,
      text: mail.tekst,
      ...(mail.antwoordNaar && lijktEenAdres(mail.antwoordNaar)
        ? { reply_to: mail.antwoordNaar }
        : {}),
      ...(mail.bijlagen && mail.bijlagen.length > 0
        ? {
            attachments: mail.bijlagen.map((bijlage) => ({
              filename: bijlage.bestandsnaam,
              content: bijlage.inhoud.toString("base64"),
            })),
          }
        : {}),
    }),
  });

  // De foutboodschap van Resend zelf meenemen: "statuscode 422" alleen laat je
  // raden, terwijl zij er bij staat te zeggen wat er scheelt.
  if (!antwoord.ok) {
    const uitleg = await antwoord.text().catch(() => "");
    throw new Error(
      `Resend gaf statuscode ${antwoord.status}${uitleg ? `: ${uitleg.slice(0, 300)}` : ""}`,
    );
  }

  const inhoud = (await antwoord.json().catch(() => null)) as { id?: string } | null;
  if (!inhoud?.id) throw new Error("Resend gaf geen bericht-id terug.");
  return inhoud.id;
}
