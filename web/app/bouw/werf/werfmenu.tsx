import Link from "next/link";

const TABS = [
  { pad: "/bouw/werf", naam: "Foto's" },
  { pad: "/bouw/werf/dagboek", naam: "Dagboek" },
  { pad: "/bouw/werf/actiepunten", naam: "Actiepunten" },
] as const;

/** De tabs bovenaan de werf. */
export function Werfmenu({ actief }: { actief: (typeof TABS)[number]["pad"] }) {
  return (
    <nav className="tabs" aria-label="Werf">
      {TABS.map((tab) => (
        <Link key={tab.pad} href={tab.pad} className={tab.pad === actief ? "actief" : undefined}>
          {tab.naam}
        </Link>
      ))}
    </nav>
  );
}
