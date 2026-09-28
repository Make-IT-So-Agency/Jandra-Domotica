import type { Bericht } from "./telegram";

export function toegelatenIds(lijst: string | undefined): Set<number> {
  return new Set(
    (lijst ?? "")
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isSafeInteger),
  );
}

/**
 * De afzender moet op de lijst staan. In een groep moet ook de groep zelf op
 * de lijst staan: zo kan niemand de bot in een eigen groep zetten en daar een
 * toegelaten persoon laten meelezen of -klikken.
 */
export function heeftToegang(bericht: Bericht, toegelaten: Set<number>): boolean {
  const afzender = bericht.from?.id;
  if (afzender === undefined || !toegelaten.has(afzender)) return false;
  return bericht.chat.type === "private" || toegelaten.has(bericht.chat.id);
}
