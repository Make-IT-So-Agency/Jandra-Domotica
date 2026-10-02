import type { SoortRuimte } from "../types";

/**
 * Wat voor ruimte het is, uit haar naam. De eerste regel die past, wint:
 * "berging/technieken" is technieken, en "nachthal" is geen inkom.
 */
const REGELS: [RegExp, SoortRuimte][] = [
  [/techn/i, "technieken"],
  [/\bwc\b|toilet/i, "wc"],
  [/badk|\bbad\b|douche|sanitair/i, "badkamer"],
  [/slaapk|\bslpk\b|\bkamer\s*\d|kinderk|ouderk|logeerk|gastenk/i, "slaapkamer"],
  [/nacht\s*hal/i, "nachthal"],
  [/inkom|\bhal\b|vestibule|\bgang\b/i, "inkom"],
  [/keuken/i, "keuken"],
  [/dressing|kleedk/i, "dressing"],
  [/was(plaats|ruimte|hok|kot)|wasserij/i, "wasplaats"],
  [/leef|living|woon|\bzit|\beet|ontspanning|speel/i, "leefruimte"],
  [/bureau|kantoor|studeer/i, "bureau"],
  [/garage|carport/i, "garage"],
  [/terras|veranda/i, "terras"],
  [/\btrap|bordes/i, "trap"],
  [/berg|opslag|kelder|zolder|stock/i, "berging"],
];

export function raadSoort(naam: string): SoortRuimte {
  for (const [regel, soort] of REGELS) if (regel.test(naam)) return soort;
  return "andere";
}
