/** Korte, leesbare labels voor Telegram. Hetzelfde als in web/lib/opvang/keuzemenu.ts. */

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

/** "di 6 okt, 18:00", in Belgische tijd. Hetzelfde als momentLabel in web/lib/opvang/inschrijfmomenten.ts. */
export function momentLabel(ms: number): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

/** "18:00", of met `seconden` "18:00:00", in Belgische tijd. */
export function uurLabel(ms: number, seconden = false): string {
  return new Date(ms).toLocaleTimeString("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconden ? { second: "2-digit" } : {}),
  });
}

/** "3 u 22 min", "5 u", "40 min". */
export function duur(ms: number): string {
  const minuten = Math.round(Math.abs(ms) / 60_000);
  const uren = Math.floor(minuten / 60);
  if (!uren) return `${minuten} min`;
  return minuten % 60 ? `${uren} u ${minuten % 60} min` : `${uren} u`;
}

export function dagLabel(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  return `${DAGEN[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export function langMoment(moment: string): string {
  const m = moment.toLowerCase();
  if (m.includes("voorschool")) return "voorschools";
  if (m.includes("naschool")) return "naschools";
  if (m.includes("woensdag")) return "woensdagnamiddag";
  if (m.includes("voormiddag")) return "voormiddag";
  if (m.includes("namiddag")) return "namiddag";
  if (/volle dag|hele dag/.test(m)) return "volle dag";
  return m;
}
