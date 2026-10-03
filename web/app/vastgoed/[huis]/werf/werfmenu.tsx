import Link from "next/link";

import { huispad } from "@/lib/bouw/paden";

const TABS = [
  { deel: "/werf", naam: "Foto's" },
  { deel: "/werf/dagboek", naam: "Dagboek" },
  { deel: "/werf/actiepunten", naam: "Actiepunten" },
  { deel: "/werf/oplevering", naam: "Oplevering" },
  { deel: "/werf/checklist", naam: "Checklist" },
] as const;

/** De tabs bovenaan de werf van een huis. */
export function Werfmenu({ huisId, actief }: { huisId: number; actief: (typeof TABS)[number]["deel"] }) {
  return (
    <nav className="tabs" aria-label="Werf">
      {TABS.map((tab) => (
        <Link key={tab.deel} href={huispad(huisId, tab.deel)} className={tab.deel === actief ? "actief" : undefined}>
          {tab.naam}
        </Link>
      ))}
    </nav>
  );
}
