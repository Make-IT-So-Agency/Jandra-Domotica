/** Korte, leesbare labels voor Telegram. Hetzelfde als in web/lib/opvang/keuzemenu.ts. */

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

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
