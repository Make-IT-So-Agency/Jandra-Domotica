import "server-only";

import {
  koppelBladen,
  type Bestaandplan,
  type Bladplan,
  type Dossieraanvraag,
  type Dossieruitkomst,
  type Dossierverdieping,
} from "./dossierregels";
import { sleutelVan } from "./invoer";
import {
  lijstGebouwen,
  lijstPlannen,
  lijstVerdiepingen,
  voegPlanToe,
  voegVerdiepingToe,
  voegVersieToe,
  wijzigVerdieping,
  zetBladcode,
  zoekOfMaakGebouw,
  type NieuweVerdieping,
  type PlanMetVersies,
} from "./opslag";
import { gelukt, mislukt, type Gebouw, type Uitkomst, type Verdieping } from "./types";

/**
 * Een dossier inlezen: één PDF met alle bladen wordt in één keer de plannen,
 * hun versies, de gebouwen en de verdiepingen. Het voorstel komt uit de
 * browser (omzetting/dossier.ts), Jan en Sandra kijken het na, en hier wordt
 * het weggeschreven.
 *
 * Wat er al is, wordt hergebruikt en niet overschreven: een blad waarvan de
 * bladcode al bij een plan hoort (of zonder bladcode: dezelfde titel in
 * hetzelfde gebouw) wordt een nieuwe versie van dat plan. Van een bestaande
 * verdieping worden enkel lege velden aangevuld.
 */

/** De plannen zoals de koppeling ze nodig heeft: met de naam van hun gebouw en hun labels. */
export function alsBestaand(plannen: PlanMetVersies[], gebouwen: Gebouw[]): Bestaandplan[] {
  const naamVan = new Map(gebouwen.map((g) => [g.id, g.naam]));
  return plannen.map((plan) => ({
    id: plan.id,
    titel: plan.titel,
    bladcode: plan.bladcode,
    gebouw: plan.gebouw_id === null ? null : (naamVan.get(plan.gebouw_id) ?? null),
    labels: plan.versies.map((versie) => versie.label),
  }));
}

/** Kijkt na of het dossier kan ingelezen worden, nog voor de PDF opgeladen wordt. */
export async function bekijkDossier(aanvraag: Dossieraanvraag): Promise<{ bladen: Bladplan[]; fouten: string[] }> {
  const [plannen, gebouwen] = await Promise.all([lijstPlannen(), lijstGebouwen()]);
  return koppelBladen(aanvraag, alsBestaand(plannen, gebouwen));
}

/** Vult de lege velden van een bestaande verdieping aan, en laat de rest staan. */
function aanvulling(bestaand: Verdieping, nieuw: Dossierverdieping): Partial<NieuweVerdieping> {
  const velden: Partial<NieuweVerdieping> = {};
  if (bestaand.vloerpeil_m === null && nieuw.vloerpeil_m !== null) velden.vloerpeil_m = nieuw.vloerpeil_m;
  if (bestaand.plafondhoogte_m === null && nieuw.plafondhoogte_m !== null) velden.plafondhoogte_m = nieuw.plafondhoogte_m;
  if (bestaand.verdiepingshoogte_m === null && nieuw.verdiepingshoogte_m !== null) {
    velden.verdiepingshoogte_m = nieuw.verdiepingshoogte_m;
  }
  return velden;
}

/**
 * Schrijft het dossier weg. bestandId is de PDF, die al opgeladen en
 * nagekeken is. Loopt het halverwege mis, dan blijft staan wat al gelukt is,
 * en zegt de melding waar het stopte; opnieuw inlezen met een ander label
 * vult de rest aan.
 */
export async function leesDossierIn(aanvraag: Dossieraanvraag, bestandId: number): Promise<Uitkomst<Dossieruitkomst>> {
  const [plannen, voor] = await Promise.all([lijstPlannen(), lijstGebouwen()]);
  const koppeling = koppelBladen(aanvraag, alsBestaand(plannen, voor));
  if (koppeling.fouten.length > 0) return mislukt(koppeling.fouten.join(" "));

  // 1. Gebouwen, op naam.
  const gebouwVan = new Map<string, number>();
  for (const naamVan of new Set(
    [...aanvraag.verdiepingen.map((v) => v.gebouw), ...aanvraag.bladen.map((b) => b.gebouw)].filter(
      (g): g is string => g !== null,
    ),
  )) {
    if (!gebouwVan.has(sleutelVan(naamVan))) gebouwVan.set(sleutelVan(naamVan), await zoekOfMaakGebouw(naamVan));
  }

  // 2. Verdiepingen, per gebouw op naam. Ook die een blad noemt zonder dat ze in de lijst staan.
  const bestaande = await lijstVerdiepingen();
  const verdiepingVan = new Map<string, number>();
  const sleutel = (gebouw: string, verdieping: string) => `${gebouwVan.get(sleutelVan(gebouw))}|${sleutelVan(verdieping)}`;
  const gevraagd = [
    ...aanvraag.verdiepingen,
    ...aanvraag.bladen
      .filter((blad) => blad.verdieping && blad.gebouw)
      .map((blad) => ({
        gebouw: blad.gebouw!,
        naam: blad.verdieping!,
        volgorde: 0,
        vloerpeil_m: null,
        plafondhoogte_m: null,
        verdiepingshoogte_m: null,
      })),
  ];
  let nieuweVerdiepingen = 0;
  for (const verdieping of gevraagd) {
    const k = sleutel(verdieping.gebouw, verdieping.naam);
    if (verdiepingVan.has(k)) continue;
    const gebouwId = gebouwVan.get(sleutelVan(verdieping.gebouw))!;
    const bestaand = bestaande.find((v) => v.gebouw_id === gebouwId && sleutelVan(v.naam) === sleutelVan(verdieping.naam));
    if (bestaand) {
      const velden = aanvulling(bestaand, verdieping);
      if (Object.keys(velden).length > 0) await wijzigVerdieping(bestaand.id, velden);
      verdiepingVan.set(k, bestaand.id);
    } else {
      verdiepingVan.set(
        k,
        await voegVerdiepingToe({
          gebouw_id: gebouwId,
          naam: verdieping.naam,
          volgorde: verdieping.volgorde,
          vloerpeil_m: verdieping.vloerpeil_m,
          verdiepingshoogte_m: verdieping.verdiepingshoogte_m,
          plafondhoogte_m: verdieping.plafondhoogte_m,
        }),
      );
      nieuweVerdiepingen++;
    }
  }

  // 3. Plannen en hun nieuwe versie.
  let nieuwePlannen = 0;
  for (const [i, blad] of aanvraag.bladen.entries()) {
    const bestaand = koppeling.bladen[i].plan;
    const gebouwId = blad.gebouw ? (gebouwVan.get(sleutelVan(blad.gebouw)) ?? null) : null;
    const verdiepingId = blad.verdieping && blad.gebouw ? (verdiepingVan.get(sleutel(blad.gebouw, blad.verdieping)) ?? null) : null;
    let planId: number;
    if (bestaand) {
      planId = bestaand.id;
      const plan = plannen.find((p) => p.id === planId);
      if (blad.bladcode && plan && plan.bladcode === null) await zetBladcode(planId, blad.bladcode);
    } else {
      planId = await voegPlanToe({
        titel: blad.titel,
        soort: blad.soort,
        gebouw_id: gebouwId,
        verdieping_id: verdiepingId,
        opmerking: null,
        bladcode: blad.bladcode,
      });
      nieuwePlannen++;
    }
    await voegVersieToe({
      plan_id: planId,
      bestand_id: bestandId,
      label: aanvraag.label,
      pagina: blad.pagina,
      datum: aanvraag.datum,
      opmerking: null,
    });
  }

  const na = await lijstGebouwen();
  return gelukt({
    plannen: aanvraag.bladen.length,
    nieuwePlannen,
    verdiepingen: nieuweVerdiepingen,
    gebouwen: na.length - voor.length,
  });
}
