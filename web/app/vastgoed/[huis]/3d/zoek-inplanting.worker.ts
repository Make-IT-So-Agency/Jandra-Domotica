import { plaatsAutomatisch, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import { perceelOpPlan, type Omgeving } from "@/lib/bouw/drie/omgeving";
import type { Blad } from "@/lib/bouw/omzetting/types";

/**
 * Zoekt op het inplantingsplan, naast het scherm: de gebouwen, of ons perceel
 * om de omgeving op het plan te leggen. Op een druk plan duurt dat soms een
 * paar seconden, en zo blijft het 3D-beeld vlot. Zie lib/bouw/drie/
 * inplanting.ts en omgeving.ts; inplantingsplan.ts start dit.
 */

export type Zoekvraag =
  | { soort: "gebouwen"; gebouwen: Zoekgebouw[]; blad: Blad; noemer: number | null }
  | { soort: "perceel"; omgeving: Omgeving; blad: Blad; noemer: number };

// In een worker is self de worker zelf, niet het venster waar de typen van uitgaan.
const werker = self as unknown as {
  onmessage: ((bericht: MessageEvent<Zoekvraag>) => void) | null;
  postMessage: (bericht: unknown) => void;
};

werker.onmessage = (bericht) => {
  const vraag = bericht.data;
  if (vraag.soort === "perceel") {
    werker.postMessage(perceelOpPlan(vraag.omgeving, vraag.blad, vraag.noemer));
    return;
  }
  const vondst = plaatsAutomatisch(vraag.gebouwen, vraag.blad, vraag.noemer);
  werker.postMessage({ noemer: vondst.noemer, bron: vondst.bron, gevonden: [...vondst.gevonden] });
};
