import Link from "next/link";

/** De tabs bovenaan Geld, met de Excel ernaast. */
export function Geldmenu({ huisId, actief }: { huisId: number; actief: "posten" | "facturen" | "kasplanning" }) {
  const klasse = (naam: typeof actief) => (naam === actief ? "actief" : undefined);
  return (
    <nav className="tabs" aria-label="Geld">
      <Link href="/bouw/geld" className={klasse("posten")}>
        Posten
      </Link>
      <Link href="/bouw/geld/facturen" className={klasse("facturen")}>
        Facturen
      </Link>
      <Link href="/bouw/geld/kasplanning" className={klasse("kasplanning")}>
        Kasplanning
      </Link>
      <a href={`/api/bouw/geld/excel?huis=${huisId}`}>Excel ↓</a>
    </nav>
  );
}
