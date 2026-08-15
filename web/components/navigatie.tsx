"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGINAS = [
  { pad: "/", naam: "Overzicht" },
  { pad: "/rapporten", naam: "Rapporten" },
  { pad: "/laadpalen", naam: "Laadpalen" },
  { pad: "/vennootschappen", naam: "Vennootschappen" },
  { pad: "/tarieven", naam: "Tarieven" },
  { pad: "/instellingen", naam: "Instellingen" },
];

export function Navigatie() {
  const huidig = usePathname();

  return (
    <nav>
      {PAGINAS.map((pagina) => (
        <Link
          key={pagina.pad}
          href={pagina.pad}
          aria-current={huidig === pagina.pad ? "page" : undefined}
        >
          {pagina.naam}
        </Link>
      ))}
    </nav>
  );
}
