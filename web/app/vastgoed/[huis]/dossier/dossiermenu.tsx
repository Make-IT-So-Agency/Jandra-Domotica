import Link from "next/link";

import { huispad } from "@/lib/bouw/paden";

const TABS = [
  { deel: "/dossier", naam: "Documenten" },
  { deel: "/dossier/garanties", naam: "Garanties" },
  { deel: "/dossier/onderhoud", naam: "Onderhoud" },
] as const;

/** De tabs bovenaan het woningdossier van een huis. */
export function Dossiermenu({ huisId, actief }: { huisId: number; actief: (typeof TABS)[number]["deel"] }) {
  return (
    <nav className="tabs" aria-label="Woningdossier">
      {TABS.map((tab) => (
        <Link key={tab.deel} href={huispad(huisId, tab.deel)} className={tab.deel === actief ? "actief" : undefined}>
          {tab.naam}
        </Link>
      ))}
    </nav>
  );
}
