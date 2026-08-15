import { TIJDZONE } from "./periods";

const euroFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const getalFormatter = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tariefFormatter = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 5,
});

const datumTijdFormatter = new Intl.DateTimeFormat("nl-BE", {
  timeZone: TIJDZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const datumFormatter = new Intl.DateTimeFormat("nl-BE", {
  timeZone: TIJDZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function euro(bedrag: number | null | undefined): string {
  if (bedrag === null || bedrag === undefined || !Number.isFinite(Number(bedrag))) {
    return "—";
  }
  return euroFormatter.format(Number(bedrag));
}

export function kwh(waarde: number | null | undefined): string {
  if (waarde === null || waarde === undefined || !Number.isFinite(Number(waarde))) {
    return "—";
  }
  return `${getalFormatter.format(Number(waarde))} kWh`;
}

export function tariefPerKwh(waarde: number): string {
  return `${tariefFormatter.format(waarde)} €/kWh`;
}

export function datumTijd(waarde: string | null | undefined): string {
  if (!waarde) return "—";
  const moment = new Date(waarde);
  return Number.isNaN(moment.getTime()) ? "—" : datumTijdFormatter.format(moment);
}

export function datum(waarde: string | null | undefined): string {
  if (!waarde) return "—";
  // Een kale YYYY-MM-DD is een kalenderdag, geen tijdstip; die mag niet door
  // de tijdzone verschoven worden.
  if (/^\d{4}-\d{2}-\d{2}$/.test(waarde)) {
    const [jaar, maand, dag] = waarde.split("-");
    return `${dag}/${maand}/${jaar}`;
  }
  const moment = new Date(waarde);
  return Number.isNaN(moment.getTime()) ? "—" : datumFormatter.format(moment);
}

export function procent(fractie: number): string {
  return `${getalFormatter.format(fractie * 100)} %`;
}

export function duur(seconden: number | null | undefined): string {
  if (seconden === null || seconden === undefined || !Number.isFinite(Number(seconden))) {
    return "—";
  }
  const totaal = Math.round(Number(seconden) / 60);
  const uren = Math.floor(totaal / 60);
  const minuten = totaal % 60;
  return uren > 0 ? `${uren} u ${minuten} min` : `${minuten} min`;
}
