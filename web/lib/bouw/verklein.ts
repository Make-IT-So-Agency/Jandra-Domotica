/**
 * Een foto verkleinen in de browser, vóór het opladen: een foto van een gsm
 * is al snel 5 MB, en Supabase draait op het gratis niveau. Wat overblijft is
 * een JPEG van hoogstens 1600 pixels, zonder de EXIF-gegevens (en dus zonder
 * de plaats waar de foto genomen werd). Enkel voor de browser.
 *
 * Een iPhone zet een HEIC-foto zelf om naar JPEG wanneer je ze kiest. Een
 * browser die het formaat niet kan lezen, geeft een duidelijke melding.
 */

export const MAX_ZIJDE = 1600;

export async function verkleinFoto(bestand: Blob, maxZijde = MAX_ZIJDE, kwaliteit = 0.85): Promise<Blob> {
  const beeld = await createImageBitmap(bestand, { imageOrientation: "from-image" }).catch(() => null);
  if (!beeld) throw new Error("Deze foto kan de browser niet lezen. Kies een JPEG- of PNG-bestand.");

  const schaal = Math.min(1, maxZijde / Math.max(beeld.width, beeld.height));
  const breedte = Math.max(1, Math.round(beeld.width * schaal));
  const hoogte = Math.max(1, Math.round(beeld.height * schaal));
  const canvas = document.createElement("canvas");
  canvas.width = breedte;
  canvas.height = hoogte;
  const context = canvas.getContext("2d");
  if (!context) {
    beeld.close();
    throw new Error("Foto verkleinen lukt niet in deze browser.");
  }
  // Wit onder een doorzichtige PNG: JPEG kent geen doorzichtigheid.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, breedte, hoogte);
  context.drawImage(beeld, 0, 0, breedte, hoogte);
  beeld.close();

  return new Promise((gelukt, mislukt) =>
    canvas.toBlob(
      (blob) => (blob ? gelukt(blob) : mislukt(new Error("Foto verkleinen mislukt."))),
      "image/jpeg",
      kwaliteit,
    ),
  );
}
