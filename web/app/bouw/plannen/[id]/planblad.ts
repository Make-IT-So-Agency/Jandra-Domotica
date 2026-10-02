"use client";

import { useEffect, useState } from "react";

import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Maat } from "@/lib/bouw/beeld";
import { haalPdfBytes, openPdf, pdfFout } from "@/lib/bouw/pdf";

import { vraagPlanUrl } from "../acties";

export interface Geladenblad {
  pagina: PDFPageProxy;
  maat: Maat;
  /** Hoeveel bladen de PDF heeft. */
  aantal: number;
}

/**
 * Haalt een plan op (uit de cache van de browser als het kan) en opent het
 * gevraagde blad. Ruimt pdf.js op als het blad niet meer nodig is.
 */
export function usePlanblad(
  versieId: number,
  bestandId: number,
  paginanummer: number,
): { blad: Geladenblad | null; fout: string | null } {
  const [blad, setBlad] = useState<Geladenblad | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    let laden: PDFDocumentLoadingTask | null = null;
    setBlad(null);
    setFout(null);
    (async () => {
      try {
        const bytes = await haalPdfBytes(bestandId, async () => {
          const antwoord = await vraagPlanUrl(versieId);
          if (!antwoord.ok) throw new Error(antwoord.melding);
          return antwoord.data.url;
        });
        if (weg) return;
        laden = openPdf(bytes);
        const pdf = await laden.promise;
        if (weg) return;
        if (paginanummer > pdf.numPages) {
          setFout(
            `Deze PDF heeft ${pdf.numPages === 1 ? "maar 1 blad" : `${pdf.numPages} bladen`}; blad ${paginanummer} bestaat niet.`,
          );
          return;
        }
        const pagina = await pdf.getPage(paginanummer);
        if (weg) return;
        const viewport = pagina.getViewport({ scale: 1 });
        setBlad({ pagina, maat: { breedte: viewport.width, hoogte: viewport.height }, aantal: pdf.numPages });
      } catch (oorzaak) {
        if (!weg) setFout(pdfFout(oorzaak));
      }
    })();
    return () => {
      weg = true;
      void laden?.destroy();
    };
  }, [versieId, bestandId, paginanummer]);

  return { blad, fout };
}
