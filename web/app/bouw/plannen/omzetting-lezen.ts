import type { PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import { zetOm } from "@/lib/bouw/omzetting/pijplijn";
import type { Referentie } from "@/lib/bouw/omzetting/referentie";
import type { Blad, Kader } from "@/lib/bouw/omzetting/types";
import { inHuis, muurlijnen, type Lijnstuk } from "@/lib/bouw/omzetting/uitlijnen";
import { haalPdfBytes, openPdf } from "@/lib/bouw/pdf";

import { vraagPlanUrl } from "./acties";

/**
 * Een blad van een planversie lezen, voor het nakijkscherm en voor alles in
 * één keer omzetten. Enkel in de browser: pdf.js komt via dynamic(..., { ssr:
 * false }) binnen.
 */

/** Haalt de PDF (uit de cache van de browser als het kan), leest het blad en ruimt pdf.js meteen op. */
export async function leesVersieblad(versie: { versieId: number; bestandId: number; pagina: number }): Promise<Blad> {
  const bytes = await haalPdfBytes(versie.bestandId, async () => {
    const antwoord = await vraagPlanUrl(versie.versieId);
    if (!antwoord.ok) throw new Error(antwoord.melding);
    return antwoord.data.url;
  });
  let taak: PDFDocumentLoadingTask | null = null;
  try {
    taak = openPdf(bytes);
    const pdf = await taak.promise;
    return await leesBlad(await pdf.getPage(versie.pagina));
  } finally {
    void taak?.destroy();
  }
}

/**
 * De muren van een gelezen blad, in meter, in het gebouw gelegd. Zonder
 * gebied zoekt de omzetting eerst waar het gebouw op het blad ligt.
 */
export function murenInHuis(blad: Blad, kalibratie: Kalibratie, gebied?: Kader | null): Lijnstuk[] {
  const waar = gebied === undefined ? zetOm(blad, { meterPerPunt: kalibratie.meterPerPunt }).gebied : gebied;
  return inHuis(muurlijnen(blad, kalibratie.meterPerPunt, waar), kalibratie);
}

/** Leest een tweede blad, om op uit te lijnen: enkel de muurlijnen zijn nodig. */
export async function leesReferentie(referentie: Referentie): Promise<Lijnstuk[]> {
  const blad = await leesVersieblad({ versieId: referentie.versieId, bestandId: referentie.bestandId, pagina: referentie.pagina });
  return murenInHuis(blad, referentie.kalibratie);
}
