import type { PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import { plaatsAutomatisch, type Inplantingsvondst, type Vondst, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import type { Inplantingsplan } from "@/lib/bouw/drie/laden";
import { perceelOpPlan, type Georef, type Omgeving } from "@/lib/bouw/drie/omgeving";
import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import type { Blad } from "@/lib/bouw/omzetting/types";
import { haalPdfBytes, openPdf, pdfFout } from "@/lib/bouw/pdf";

import { vraagPlanUrl } from "../plannen/acties";
import type { Zoekvraag } from "./zoek-inplanting.worker";

/**
 * Het inplantingsplan in de browser: het blad lezen (de vormen, voor het
 * automatisch plaatsen) en tekenen (de textuur op de grond). Enkel in de
 * browser: het 3D-scherm laadt dit bestand pas als er een plan is, zodat
 * pdf.js niet in de bundel van het scherm zelf zit.
 */

export interface GeladenPlan {
  planId: number;
  blad: Blad;
  /** Het blad als beeld, hoogstens zoveel pixels breed of hoog als de grafische kaart aankan. */
  beeld: HTMLCanvasElement;
}

/** Haalt de nieuwste versie op (uit de cache van de browser als het kan), leest het blad en tekent het. */
export async function laadInplantingsplan(huisId: number, plan: Inplantingsplan, maxPixels: number): Promise<GeladenPlan> {
  let taak: PDFDocumentLoadingTask | null = null;
  try {
    const bytes = await haalPdfBytes(plan.versie.bestandId, async () => {
      const antwoord = await vraagPlanUrl(huisId, plan.versie.versieId);
      if (!antwoord.ok) throw new Error(antwoord.melding);
      return antwoord.data.url;
    });
    taak = openPdf(bytes);
    const pdf = await taak.promise;
    if (plan.versie.pagina > pdf.numPages) throw new Error(`Blad ${plan.versie.pagina} bestaat niet in deze PDF.`);
    const pagina = await pdf.getPage(plan.versie.pagina);
    const blad = await leesBlad(pagina);
    const schaal = Math.min(maxPixels / Math.max(blad.breedte, blad.hoogte), 4);
    const viewport = pagina.getViewport({ scale: schaal });
    const beeld = document.createElement("canvas");
    beeld.width = Math.floor(viewport.width);
    beeld.height = Math.floor(viewport.height);
    await pagina.render({ canvas: beeld, viewport }).promise;
    return { planId: plan.id, blad, beeld };
  } catch (fout) {
    throw new Error(pdfFout(fout));
  } finally {
    void taak?.destroy();
  }
}

/**
 * Rekent in een webworker, zodat het beeld vlot blijft; zonder worker (een
 * oude browser), of als hij niet laadt of vastloopt, gewoon hier.
 */
function inWorker<T>(vraag: Zoekvraag, hier: () => T, lees: (antwoord: unknown) => T): Promise<T> {
  return new Promise((klaar, mislukt) => {
    const nuHier = () => {
      try {
        klaar(hier());
      } catch (fout) {
        mislukt(fout);
      }
    };
    if (typeof Worker === "undefined") return nuHier();
    let worker: Worker;
    try {
      worker = new Worker(new URL("./zoek-inplanting.worker.ts", import.meta.url));
    } catch {
      return nuHier();
    }
    worker.onmessage = (bericht: MessageEvent<unknown>) => {
      worker.terminate();
      klaar(lees(bericht.data));
    };
    worker.onerror = () => {
      worker.terminate();
      nuHier();
    };
    worker.postMessage(vraag);
  });
}

/** Zoekt de gebouwen op het blad. */
export function zoekInplanting(gebouwen: Zoekgebouw[], blad: Blad, noemer: number | null): Promise<Inplantingsvondst> {
  return inWorker(
    { soort: "gebouwen", gebouwen, blad, noemer },
    () => plaatsAutomatisch(gebouwen, blad, noemer),
    (antwoord) => {
      const { noemer: n, bron, gevonden } = antwoord as { noemer: number | null; bron: Inplantingsvondst["bron"]; gevonden: [number, Vondst][] };
      return { noemer: n, bron, gevonden: new Map(gevonden) };
    },
  );
}

/** Zoekt ons perceel op het blad, om de omgeving op het plan te leggen. */
export function zoekPerceel(omgeving: Omgeving, blad: Blad, noemer: number): Promise<{ georef: Georef; overeenkomst: number } | null> {
  return inWorker(
    { soort: "perceel", omgeving, blad, noemer },
    () => perceelOpPlan(omgeving, blad, noemer),
    (antwoord) => antwoord as { georef: Georef; overeenkomst: number } | null,
  );
}
