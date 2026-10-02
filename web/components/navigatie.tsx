"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { actievePagina } from "@/lib/navigatie";

export interface Paginalink {
  pad: string;
  naam: string;
}

export function Navigatie({
  paginas,
  label = "Hoofdmenu",
  klasse = "hoofdmenu",
}: {
  paginas: Paginalink[];
  label?: string;
  klasse?: string;
}) {
  const actief = actievePagina(
    usePathname(),
    paginas.map((pagina) => pagina.pad),
  );

  return (
    <nav className={klasse} aria-label={label}>
      {paginas.map((pagina) => (
        <Link
          key={pagina.pad}
          href={pagina.pad}
          aria-current={actief === pagina.pad ? "page" : undefined}
        >
          {pagina.naam}
        </Link>
      ))}
    </nav>
  );
}
