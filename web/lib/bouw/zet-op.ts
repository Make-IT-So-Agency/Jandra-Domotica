import { vertaalOpslagfout } from "./bestanden";

/**
 * Zet een bestand rechtstreeks in Supabase Storage, met de ondertekende URL
 * die de server gaf. Geen Supabase-sleutel nodig: het token in de URL is de
 * toelating, voor precies dat ene pad.
 *
 * Via XMLHttpRequest en niet via fetch, omdat fetch geen voortgang van een
 * upload meldt.
 */
export function zetOp(
  url: string,
  bestand: Blob,
  contentType: string,
  opVoortgang?: (fractie: number) => void,
): Promise<void> {
  return new Promise((gelukt, mislukt) => {
    const verzoek = new XMLHttpRequest();
    verzoek.open("PUT", url);
    verzoek.setRequestHeader("content-type", contentType);
    verzoek.upload.onprogress = (gebeurtenis) => {
      if (gebeurtenis.lengthComputable) opVoortgang?.(gebeurtenis.loaded / gebeurtenis.total);
    };
    verzoek.onload = () => {
      if (verzoek.status >= 200 && verzoek.status < 300) gelukt();
      else mislukt(new Error(vertaalOpslagfout(verzoek.status, verzoek.responseText)));
    };
    verzoek.onerror = () => mislukt(new Error(vertaalOpslagfout(0, "")));
    verzoek.send(bestand);
  });
}
