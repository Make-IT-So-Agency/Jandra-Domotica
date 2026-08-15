"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Paginalink {
  pad: string;
  naam: string;
}

export function Navigatie({ paginas }: { paginas: Paginalink[] }) {
  const huidig = usePathname();

  return (
    <nav>
      {paginas.map((pagina) => (
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
