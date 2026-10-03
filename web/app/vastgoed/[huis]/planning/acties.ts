"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { datum, getal, id, tekst } from "@/lib/bouw/invoer";
import { plusDagen } from "@/lib/bouw/kalender";
import { huispad } from "@/lib/bouw/paden";
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

const pad = (huisId: number) => huispad(huisId, "/planning");
/** De planning met dit item open om te wijzigen. */
const itempad = (huisId: number, itemId: number) => huispad(huisId, `/planning?item=${itemId}`);

async function leesItem(huisId: number, formulier: FormData, eigenId: number | null): Promise<NieuwPlanningsitem> {
  const terugNaar = eigenId ? itempad(huisId, eigenId) : pad(huisId);
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
    const fase = await leesPlanningsitem(huisId, faseId);
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

export async function voegPlanningToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const item = await leesItem(huis.id, formulier, null);
  try {
    await voegPlanningToe(huis.id, item);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", `${item.titel} staat in de planning.`);
}

export async function wijzigPlanningActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(terugNaar, "fout", "Onbekend item.");
  const item = await leesItem(huis.id, formulier, itemId);
  try {
    await wijzigPlanning(huis.id, itemId, item);
  } catch (fout) {
    terug(itempad(huis.id, itemId), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `${item.titel} bewaard.`);
}

export async function verwijderPlanningActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(terugNaar, "fout", "Onbekend item.");
  try {
    await verwijderPlanning(huis.id, itemId);
  } catch (fout) {
    terug(itempad(huis.id, itemId), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Uit de planning gehaald.");
}

/**
 * Iets loopt uit: schuif het op, en als dat gevraagd is ook alles wat op of
 * na zijn begindatum begint en nog niet klaar is.
 */
export async function schuifOpActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const itemId = id(formulier.get("id"));
  if (!itemId) terug(pad(huis.id), "fout", "Onbekend item.");
  const terugNaar = itempad(huis.id, itemId);
  const dagen = getal(formulier.get("dagen"), "Het aantal dagen");
  if (!dagen.ok) terug(terugNaar, "fout", dagen.melding);
  if (dagen.waarde === null || !Number.isInteger(dagen.waarde) || dagen.waarde === 0 || Math.abs(dagen.waarde) > 730) {
    terug(terugNaar, "fout", "Schuif een aantal hele dagen op, bv. 14, of -7 om te vervroegen.");
  }
  const ookLater = formulier.get("bereik") === "en_later";

  let aantal = 0;
  try {
    const planning = await lijstPlanning(huis.id);
    const item = planning.find((rij) => rij.id === itemId);
    if (!item) throw new Error("Dit item bestaat niet meer.");
    const teSchuiven = ookLater
      ? planning.filter((rij) => rij.id === itemId || (rij.begindatum >= item.begindatum && rij.status !== "klaar"))
      : [item];
    for (const rij of teSchuiven) {
      const { id: rijId, ...rest } = rij;
      await wijzigPlanning(huis.id, rijId, {
        ...rest,
        begindatum: plusDagen(rij.begindatum, dagen.waarde),
        einddatum: rij.einddatum ? plusDagen(rij.einddatum, dagen.waarde) : null,
      });
    }
    aantal = teSchuiven.length;
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Opschuiven mislukt."));
  }
  terug(pad(huis.id), "goed", `${aantal === 1 ? "1 item" : `${aantal} items`} ${dagen.waarde > 0 ? "opgeschoven" : "vervroegd"} met ${Math.abs(dagen.waarde)} dagen.`);
}

export async function voorbeeldplanningActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const begin = datum(formulier.get("begindatum"));
  if (!begin) terug(terugNaar, "fout", "Kies de datum waarop de vergunningsaanvraag vertrekt.");
  let aantal = 0;
  try {
    if ((await lijstPlanning(huis.id)).length > 0) {
      throw new Error("Er staat al een planning. Een voorbeeld komt enkel in een lege planning.");
    }
    aantal = await voegPlanningenToe(huis.id, voorbeeldVanaf(begin));
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "De voorbeeldplanning maken is mislukt."));
  }
  terug(terugNaar, "goed", `${aantal} fasen, taken en mijlpalen aangemaakt. Pas de data aan en hang de aannemers eraan.`);
}
