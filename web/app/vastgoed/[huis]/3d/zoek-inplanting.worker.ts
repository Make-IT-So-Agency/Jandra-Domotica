import { plaatsAutomatisch, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import type { Blad } from "@/lib/bouw/omzetting/types";

/**
 * Zoekt de gebouwen op het inplantingsplan, naast het scherm: op een druk plan
 * duurt dat soms een paar seconden, en zo blijft het 3D-beeld vlot. Zie
 * lib/bouw/drie/inplanting.ts; zoekInplanting in inplantingsplan.ts start dit.
 */

// In een worker is self de worker zelf, niet het venster waar de typen van uitgaan.
const werker = self as unknown as {
  onmessage: ((bericht: MessageEvent<{ gebouwen: Zoekgebouw[]; blad: Blad; noemer: number | null }>) => void) | null;
  postMessage: (bericht: unknown) => void;
};

werker.onmessage = (bericht) => {
  const { gebouwen, blad, noemer } = bericht.data;
  const vondst = plaatsAutomatisch(gebouwen, blad, noemer);
  werker.postMessage({ noemer: vondst.noemer, bron: vondst.bron, gevonden: [...vondst.gevonden] });
};
