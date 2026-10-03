import type { PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import { plaatsAutomatisch, type Inplantingsvondst, type Vondst, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import type { Inplantingsplan } from "@/lib/bouw/drie/laden";
import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import type { Blad } from "@/lib/bouw/omzetting/types";
import { haalPdfBytes, openPdf, pdfFout } from "@/lib/bouw/pdf";

import { vraagPlanUrl } from "../plannen/acties";

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
 * Zoekt de gebouwen op het blad, in een webworker zodat het beeld vlot blijft;
 * zonder worker (een oude browser) gewoon hier.
 */
export function zoekInplanting(gebouwen: Zoekgebouw[], blad: Blad, noemer: number | null): Promise<Inplantingsvondst> {
  return new Promise((klaar, mislukt) => {
    const hier = () => {
      try {
        klaar(plaatsAutomatisch(gebouwen, blad, noemer));
      } catch (fout) {
        mislukt(fout);
      }
    };
    if (typeof Worker === "undefined") return hier();
    let worker: Worker;
    try {
      worker = new Worker(new URL("./zoek-inplanting.worker.ts", import.meta.url));
    } catch {
      return hier();
    }
    worker.onmessage = (bericht: MessageEvent<{ noemer: number | null; bron: Inplantingsvondst["bron"]; gevonden: [number, Vondst][] }>) => {
      worker.terminate();
      klaar({ noemer: bericht.data.noemer, bron: bericht.data.bron, gevonden: new Map(bericht.data.gevonden) });
    };
    // Laadt de worker niet, of loopt hij vast op een fout: dan hier, en een fout komt bij wie wacht.
    worker.onerror = () => {
      worker.terminate();
      hier();
    };
    worker.postMessage({ gebouwen, blad, noemer });
  });
}
