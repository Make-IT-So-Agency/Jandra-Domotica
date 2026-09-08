export interface Vennootschap {
  id: string;
  name: string;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  is_active: boolean;
}

export interface Laadpaal {
  id: string;
  name: string;
  display_name: string | null;
  company_id: string | null;
  region: string;
  is_active: boolean;
}

export interface Laadsessie {
  id: string;
  external_id: string;
  loadpoint_name: string | null;
  vehicle: string | null;
  started_at: string | null;
  finished_at: string | null;
  energy_kwh: number | null;
  meter_start_kwh: number | null;
  meter_stop_kwh: number | null;
  duration_seconds: number | null;
  solar_percentage: number | null;
  odometer_km: number | null;
  evcc_price_eur: number | null;
  evcc_price_per_kwh: number | null;
  is_complete: boolean;
}

export interface Tarief {
  id: string;
  region: string;
  period_start: string;
  period_end: string;
  eur_per_kwh: number;
  includes_vat: boolean;
  vat_rate: number;
  source: "manual" | "auto";
  source_url: string | null;
  note: string | null;
  confirmed_at: string | null;
}

export interface Meterstand {
  loadpoint_name: string;
  reading_kwh: number;
  read_at: string;
}

export interface RapportRegel {
  sessie_id: string;
  external_id: string;
  laadpaal: string;
  gestart: string | null;
  gestopt: string | null;
  kwh: number;
  tarief_per_kwh: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  bedrag_incl_btw: number;
  btw_percentage: number;
}

export interface RapportTotalen {
  aantal_sessies: number;
  kwh: number;
  excl_btw: number;
  btw: number;
  incl_btw: number;
}

export interface MeterstandOverzicht {
  laadpaal: string;
  begin_kwh: number | null;
  eind_kwh: number | null;
  verschil_kwh: number | null;
  sessies_kwh: number;
  afwijking_kwh: number | null;
}

export interface RapportMomentopname {
  vennootschap: {
    naam: string;
    btw_nummer: string | null;
    adres: string | null;
  };
  begunstigde: Begunstigde;
  periode: { start: string; eind: string; label: string; soort: string };
  regels: RapportRegel[];
  totalen: RapportTotalen;
  meterstanden: MeterstandOverzicht[];
  tarieven: Array<{
    periode: string;
    eur_per_kwh: number;
    btw_percentage: number;
    inclusief_btw: boolean;
    bron: string;
    bron_url: string | null;
  }>;
  opgemaakt_op: string;
}

export interface Begunstigde {
  naam: string;
  adres: string;
  email: string;
  rekeningnummer: string;
  btw_nummer: string;
}

export interface Instellingen {
  begunstigde: Begunstigde;
  /** Standaardregio voor nieuwe laadpalen en tariefophaling. */
  regio: string;
  /** Bron waar het kwartaaltarief automatisch gezocht wordt. */
  tarief_bron_url: string;
}
