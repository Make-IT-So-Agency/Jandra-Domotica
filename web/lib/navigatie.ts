import type { Paginalink } from "@/components/navigatie";

import { magGebruikersBeheren, magInstellingenBeheren, type Gebruiker } from "./rollen";

/** De pagina's die deze gebruiker te zien krijgt, in menuvolgorde. */
export function zichtbarePaginas(gebruiker: Gebruiker): Paginalink[] {
  const paginas: Paginalink[] = [
    { pad: "/", naam: "Overzicht" },
    { pad: "/rapporten", naam: "Rapporten" },
  ];

  if (magInstellingenBeheren(gebruiker)) {
    paginas.push(
      { pad: "/laadpalen", naam: "Laadpalen" },
      { pad: "/vennootschappen", naam: "Vennootschappen" },
      { pad: "/tarieven", naam: "Tarieven" },
    );
  }

  if (magGebruikersBeheren(gebruiker)) {
    paginas.push({ pad: "/gebruikers", naam: "Gebruikers" });
  }

  if (magInstellingenBeheren(gebruiker)) {
    paginas.push({ pad: "/instellingen", naam: "Instellingen" });
  }

  return paginas;
}
