/**
 * De plannen die de browser bewaart, in de Cache API. Apart van pdf.ts, zodat
 * de loginpagina de cache kan wissen zonder pdf.js mee te laden.
 */

export const PLANCACHE = "bouw-plannen-v1";

/** Wist de bewaarde plannen, bv. na het afmelden op een gedeeld toestel. */
export async function wisPlancache(): Promise<void> {
  try {
    await caches.delete(PLANCACHE);
  } catch {
    // Niets bewaard, of geen Cache API: niets te wissen.
  }
}
