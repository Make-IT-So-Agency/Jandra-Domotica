import {
  kwartaalPeriode,
  maandPeriode,
  periodeUitWaarde,
  vrijePeriode,
  type Periode,
} from "@/lib/periods";

export interface PeriodeKeuze {
  /** Eén waarde uit de keuzelijst, bv. "quarter:2026-3" of "vrij". */
  periode?: string;
  van: string;
  tot: string;

  // Hieronder de oude, losse velden. Ze blijven werken voor bladwijzers en
  // opgeslagen links van voor de keuzelijst er was.
  soort?: string;
  jaar?: string;
  maand?: string;
  kwartaal?: string;
}

/** Zet de keuzes uit het formulier om naar een concrete periode. */
export function periodeUitFormulier(keuze: PeriodeKeuze): Periode {
  const waarde = (keuze.periode ?? "").trim();

  if (waarde === "vrij" || (waarde === "" && keuze.soort === "vrij")) {
    if (!keuze.van || !keuze.tot) {
      throw new Error("Vul een begin- en einddatum in.");
    }
    return vrijePeriode(keuze.van, keuze.tot);
  }

  if (waarde !== "") {
    const gekozen = periodeUitWaarde(waarde);
    if (!gekozen) {
      throw new Error("Kies een periode uit de lijst.");
    }
    return gekozen;
  }

  const jaar = Number(keuze.jaar);
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) {
    throw new Error("Kies een geldig jaar.");
  }

  if (keuze.soort === "quarter") {
    const kwartaal = Number(keuze.kwartaal);
    if (!Number.isInteger(kwartaal) || kwartaal < 1 || kwartaal > 4) {
      throw new Error("Kies een geldig kwartaal.");
    }
    return kwartaalPeriode(jaar, kwartaal);
  }

  const maand = Number(keuze.maand);
  if (!Number.isInteger(maand) || maand < 1 || maand > 12) {
    throw new Error("Kies een geldige maand.");
  }
  return maandPeriode(jaar, maand);
}
