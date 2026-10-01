import "server-only";

import { maakRapportExcel } from "./excel";
import { datum, euro, kwh } from "./format";
import { lijktEenAdres, verstuurMail } from "./mail";
import { maakRapportPdf } from "./pdf";
import { leesInstellingen } from "./settings";
import { db } from "./supabase";
import type { RapportMomentopname } from "./types";

/**
 * Stuurt één bewaard rapport naar de vennootschap.
 *
 * Het rapport is op dat moment al opgeslagen. Dat is met opzet die volgorde:
 * mislukt het versturen, dan staat het rapport er nog en kan het alsnog met de
 * hand verstuurd of gedownload worden. Andersom zou een mail kunnen vertrekken
 * naar een rapport dat nergens bewaard is.
 */

export interface TeVersturenRapport {
  id: string;
  referentie: string;
  momentopname: RapportMomentopname;
  /** Adres van de vennootschap, zoals het op dat moment ingevuld staat. */
  adres: string | null;
}

export function bouwOnderwerp(momentopname: RapportMomentopname, referentie: string): string {
  const { vennootschap, periode } = momentopname;
  return `Laadkosten ${periode.label} — ${vennootschap.naam} (${referentie})`;
}

export function bouwBericht(
  momentopname: RapportMomentopname,
  referentie: string,
): string {
  const { vennootschap, periode, totalen, begunstigde } = momentopname;

  // Een vaste breedte voor de labels, zodat de bedragen in een tekstmail onder
  // elkaar uitkomen. HTML zou netter ogen, maar een tekstbericht komt overal
  // aan zoals het bedoeld is en belandt minder snel in de spam.
  const regel = (label: string, waarde: string) => `  ${label.padEnd(16)}${waarde}`;

  return [
    "Beste,",
    "",
    `In bijlage de laadkosten van ${vennootschap.naam} voor ${periode.label} ` +
      `(${datum(periode.start)} t.e.m. ${datum(periode.eind)}).`,
    "",
    regel("Sessies", String(totalen.aantal_sessies)),
    regel("Verbruik", kwh(totalen.kwh)),
    regel("Totaal excl. btw", euro(totalen.excl_btw)),
    regel("Btw", euro(totalen.btw)),
    regel("Totaal incl. btw", euro(totalen.incl_btw)),
    "",
    "Het bedrag is berekend met het maximumtarief per kWh dat de CREG voor dat",
    "kwartaal publiceert. De details per laadsessie staan in de bijlagen: een",
    "PDF om na te lezen en een Excel om mee verder te werken.",
    "",
    `Referentie: ${referentie}`,
    "Dit bericht is automatisch verstuurd zodra het kwartaal afgesloten was.",
    "",
    begunstigde.naam || "",
  ]
    .join("\n")
    .trimEnd();
}

export interface VerzendUitkomst {
  verstuurd: boolean;
  adres?: string;
  reden?: string;
}

export async function verstuurRapport(
  rapport: TeVersturenRapport,
): Promise<VerzendUitkomst> {
  if (!lijktEenAdres(rapport.adres)) {
    return {
      verstuurd: false,
      reden: rapport.adres?.trim()
        ? `het e-mailadres van de vennootschap is onbruikbaar: ${rapport.adres}`
        : "er staat geen e-mailadres bij deze vennootschap",
    };
  }
  const adres = rapport.adres!.trim();

  const [pdf, werkmap, instellingen] = await Promise.all([
    maakRapportPdf(rapport.momentopname, rapport.referentie),
    maakRapportExcel(rapport.momentopname, rapport.referentie),
    leesInstellingen(),
  ]);

  await verstuurMail({
    aan: adres,
    onderwerp: bouwOnderwerp(rapport.momentopname, rapport.referentie),
    tekst: bouwBericht(rapport.momentopname, rapport.referentie),
    // Antwoorden horen bij de begunstigde terecht te komen en niet bij het
    // afzenderadres van de app, waar niemand naar kijkt.
    antwoordNaar: instellingen.begunstigde.email || null,
    bijlagen: [
      { bestandsnaam: `Laadkosten-${rapport.referentie}.pdf`, inhoud: pdf },
      { bestandsnaam: `Laadkosten-${rapport.referentie}.xlsx`, inhoud: werkmap },
    ],
  });

  // Pas noteren als de mail echt weg is. Zou dit ervoor staan, dan gold een
  // rapport als verstuurd terwijl de verzending faalde, en werd het nooit meer
  // opnieuw geprobeerd.
  const { error } = await db()
    .from("reports")
    .update({ emailed_at: new Date().toISOString(), emailed_to: adres })
    .eq("id", rapport.id);

  if (error) {
    // De mail is wél vertrokken. Dat moet blijken uit de melding, anders wordt
    // er straks een tweede keer verstuurd op basis van een leeg emailed_at.
    throw new Error(
      `De mail naar ${adres} is verstuurd, maar het bijhouden ervan mislukte: ${error.message}`,
    );
  }

  return { verstuurd: true, adres };
}
