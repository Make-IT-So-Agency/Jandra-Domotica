import Link from "next/link";

const TABS = [
  { pad: "/bouw/dossier", naam: "Documenten" },
  { pad: "/bouw/dossier/garanties", naam: "Garanties" },
  { pad: "/bouw/dossier/onderhoud", naam: "Onderhoud" },
] as const;

/** De tabs bovenaan het woningdossier. */
export function Dossiermenu({ actief }: { actief: (typeof TABS)[number]["pad"] }) {
  return (
    <nav className="tabs" aria-label="Woningdossier">
      {TABS.map((tab) => (
        <Link key={tab.pad} href={tab.pad} className={tab.pad === actief ? "actief" : undefined}>
          {tab.naam}
        </Link>
      ))}
    </nav>
  );
}
