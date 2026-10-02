/**
 * pdf.js in de browser: een plan ophalen, bewaren en openen.
 *
 * Enkel in de browser te gebruiken. De viewer laadt dit bestand via
 * dynamic(..., { ssr: false }), zodat pdf.js nooit in een serverbundel komt.
 *
 * We gebruiken de legacy-build van pdf.js. De gewone build vraagt de nieuwste
 * Chrome of Firefox; Safari, en dus elke browser op een iPad of iPhone, heeft
 * de legacy-build nodig.
 */

import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import { PLANCACHE } from "./plancache";

// Next bundelt de worker als een apart bestand onder /_next/static.
GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

/** De sleutel in de Cache API. Die URL wordt nooit opgevraagd; ze is enkel een naam. */
function sleutel(bestandId: number): string {
  return `/bouw-cache/bestand/${bestandId}`;
}

/**
 * De bytes van een plan. Een bestand verandert nooit (een nieuwe versie is een
 * nieuw bestand), dus een plan dat al eens geopend werd, komt uit de cache van
 * de browser. Dat spaart dataverkeer op het gratis niveau van Supabase; een
 * ondertekende URL is elke keer anders, dus de gewone HTTP-cache helpt niet.
 */
export async function haalPdfBytes(bestandId: number, vraagUrl: () => Promise<string>): Promise<Uint8Array> {
  try {
    const cache = await caches.open(PLANCACHE);
    const bewaard = await cache.match(sleutel(bestandId));
    if (bewaard) return new Uint8Array(await bewaard.arrayBuffer());
  } catch {
    // Geen Cache API (privévenster, oude browser): gewoon ophalen.
  }

  const url = await vraagUrl();
  const antwoord = await fetch(url);
  if (!antwoord.ok) throw new Error(`Het plan ophalen is mislukt (HTTP ${antwoord.status}).`);
  const bytes = new Uint8Array(await antwoord.arrayBuffer());

  try {
    const cache = await caches.open(PLANCACHE);
    await cache.put(sleutel(bestandId), new Response(new Blob([bytes]), { headers: { "content-type": "application/pdf" } }));
  } catch {
    // Niet kunnen bewaren is geen reden om het plan niet te tonen.
  }
  return bytes;
}

/**
 * Opent een PDF. pdf.js neemt de buffer over, dus het krijgt een kopie. Wie
 * klaar is, roept destroy() op de taak aan; dat ruimt ook de worker op.
 */
export function openPdf(bytes: Uint8Array): PDFDocumentLoadingTask {
  return getDocument({ data: bytes.slice() });
}

/** Een fout van pdf.js in mensentaal. */
export function pdfFout(fout: unknown): string {
  const naam = fout instanceof Error ? fout.name : "";
  if (naam === "PasswordException") return "Deze PDF is beveiligd met een wachtwoord en kan hier niet getoond worden.";
  if (naam === "InvalidPDFException") return "Dit bestand is geen geldige PDF.";
  return fout instanceof Error && fout.message ? fout.message : "Het plan kon niet getoond worden.";
}
