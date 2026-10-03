import Link from "next/link";

import { huispad } from "@/lib/bouw/paden";
import type { Werffoto } from "@/lib/bouw/werf-opslag";

const uur = (tijd: string) =>
  new Date(tijd).toLocaleTimeString("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });

/** Tegels met de kleine versie van elke foto; een tik opent de foto zelf. */
export function Galerij({
  huisId,
  fotos,
  urls,
  ruimtenaam,
}: {
  huisId: number;
  fotos: Werffoto[];
  urls: Map<number, string>;
  ruimtenaam: (ruimteId: number | null) => string | null;
}) {
  return (
    <ul className="galerij">
      {fotos.map((foto) => {
        const url = urls.get(foto.id);
        const bij = foto.onderschrift ?? ruimtenaam(foto.ruimte_id) ?? uur(foto.genomen_op);
        return (
          <li key={foto.id}>
            <Link href={huispad(huisId, `/werf/foto/${foto.id}`)} title={bij}>
              {url ? (
                // Een gewone img: de URL is ondertekend en vervalt, daar valt niets aan te optimaliseren.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={bij} loading="lazy" decoding="async" />
              ) : (
                <span className="galerij-leeg">foto</span>
              )}
              <span className="galerij-bij">{bij}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
