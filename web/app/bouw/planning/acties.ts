"use server";

import { datum, getal, id, tekst } from "@/lib/bouw/invoer";
import { plusDagen } from "@/lib/bouw/kalender";
import { isSoortPlanning, isStatusPlanning, voorbeeldVanaf } from "@/lib/bouw/planning";
import {
  leesPlanningsitem,
  lijstPlanning,
  verwijderPlanning,
  voegPlanningToe,
  voegPlanningenToe,
  wijzigPlanning,
  type NieuwPlanningsitem,
} from "@/lib/bouw/regie-opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { vereistBouwrechten } from "@/lib/toegang";

const PAD = "/bouw/planning";

async function leesItem(formulier: FormData, eigenId: number | null): Promise<NieuwPlanningsitem> {
  const terugNaar = eigenId ? `${PAD}?item=${eigenId}` : PAD;
  const soort = String(formulier.get("soort") ?? "");
  if (!isSoortPlanning(soort)) terug(terugNaar, "fout", "Kies fase, taak of mijlpaal.");
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Geef het een titel.");
  const begindatum = datum(formulier.get("begindatum"));
  if (!begindatum) terug(terugNaar, "fout", "Vul een geldige begindatum in.");

  const ruweEinde = tekst(formulier.get("einddatum"));
  const einddatum = soort === "mijlpaal" ? null : datum(ruweEinde);
  if (soort !== "mijlpaal" && ruweEinde && !einddatum) terug(terugNaar, "fout", "De einddatum is geen geldige datum.");
  if (einddatum && einddatum < begindatum) terug(terugNaar, "fout", "De einddatum ligt vóór de begindatum.");

  const status = String(formulier.get("status") ?? "gepland");
  if (!isStatusPlanning(status)) terug(terugNaar, "fout", "Onbekende status.");

  // Een fase hoort bij geen fase, en iets hoort nooit bij zichzelf.
  let faseId = soort === "fase" ? null : id(formulier.get("fase_id"));
  if (faseId !== null) {
    const fase = await leesPlanningsitem(faseId);
    if (!fase || fase.soort !== "fase" || fase.id === eigenId) faseId = null;
  }

  return {
    soort,
    titel,
    begindatum,
    einddatum: einddatum === begindatum ? null : einddatum,
    fase_id: faseId,
    partij_id: id(formulier.get("partij_id")),
    status,
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegPlanningToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const item = await leesItem(formulier, null);
  try {
    await voegPlanningToe(item);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(PAD, "goed", `${item.titel} staat in de planning.`);
}

export async function wijzigPlanningActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(PAD, "fout", "Onbekend item.");
  const item = await leesItem(formulier, itemId);
  try {
    await wijzigPlanning(itemId, item);
  } catch (fout) {
    terug(`${PAD}?item=${itemId}`, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", `${item.titel} bewaard.`);
}

export async function verwijderPlanningActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(PAD, "fout", "Onbekend item.");
  try {
    await verwijderPlanning(itemId);
  } catch (fout) {
    terug(`${PAD}?item=${itemId}`, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Uit de planning gehaald.");
}

/**
 * Iets loopt uit: schuif het op, en als dat gevraagd is ook alles wat op of
 * na zijn begindatum begint en nog niet klaar is.
 */
export async function schuifOpActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(PAD, "fout", "Onbekend item.");
  const terugNaar = `${PAD}?item=${itemId}`;
  const dagen = getal(formulier.get("dagen"), "Het aantal dagen");
  if (!dagen.ok) terug(terugNaar, "fout", dagen.melding);
  if (dagen.waarde === null || !Number.isInteger(dagen.waarde) || dagen.waarde === 0 || Math.abs(dagen.waarde) > 730) {
    terug(terugNaar, "fout", "Schuif een aantal hele dagen op, bv. 14, of -7 om te vervroegen.");
  }
  const ookLater = formulier.get("bereik") === "en_later";

  let aantal = 0;
  try {
    const planning = await lijstPlanning();
    const item = planning.find((rij) => rij.id === itemId);
    if (!item) throw new Error("Dit item bestaat niet meer.");
    const teSchuiven = ookLater
      ? planning.filter((rij) => rij.id === itemId || (rij.begindatum >= item.begindatum && rij.status !== "klaar"))
      : [item];
    for (const rij of teSchuiven) {
      const { id: rijId, ...rest } = rij;
      await wijzigPlanning(rijId, {
        ...rest,
        begindatum: plusDagen(rij.begindatum, dagen.waarde),
        einddatum: rij.einddatum ? plusDagen(rij.einddatum, dagen.waarde) : null,
      });
    }
    aantal = teSchuiven.length;
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Opschuiven mislukt."));
  }
  terug(PAD, "goed", `${aantal === 1 ? "1 item" : `${aantal} items`} ${dagen.waarde > 0 ? "opgeschoven" : "vervroegd"} met ${Math.abs(dagen.waarde)} dagen.`);
}

export async function voorbeeldplanningActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const begin = datum(formulier.get("begindatum"));
  if (!begin) terug(PAD, "fout", "Kies de datum waarop de vergunningsaanvraag vertrekt.");
  let aantal = 0;
  try {
    if ((await lijstPlanning()).length > 0) throw new Error("Er staat al een planning. Een voorbeeld komt enkel in een lege planning.");
    aantal = await voegPlanningenToe(voorbeeldVanaf(begin));
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "De voorbeeldplanning maken is mislukt."));
  }
  terug(PAD, "goed", `${aantal} fasen, taken en mijlpalen aangemaakt. Pas de data aan en hang de aannemers eraan.`);
}
