import Link from "next/link";

import type { Menumodule, Paginalink } from "@/lib/navigatie";

import { ModuleIcoon } from "./module-icoon";

/** De snelkoppelingen van een module: bij Vastgoed elk huis, anders haar pagina's. */
function snelkoppelingen(module: Menumodule): Paginalink[] {
  if (module.huizen) {
    return [
      ...module.huizen.map((huis) => ({ pad: huis.paginas[0]?.pad ?? module.start, naam: huis.naam })),
      ...module.secties.flatMap((sectie) => sectie.paginas),
    ];
  }
  return module.secties.flatMap((sectie) => sectie.paginas);
}

/** Een kaart per module, in de volgorde van het menu: Beheer achteraan. */
export function Startmodules({ menu }: { menu: Menumodule[] }) {
  return (
    <div className="startmodules">
      {menu.map((module) => (
        <section key={module.id} className="startmodule" aria-labelledby={`module-${module.id}`}>
          <Link href={module.start} className="startmodule-kop">
            <span className="startmodule-icoon">
              <ModuleIcoon icoon={module.icoon} />
            </span>
            <h2 id={`module-${module.id}`}>{module.naam}</h2>
          </Link>
          <p className="hulp">{module.uitleg}</p>
          <ul className="startlinks">
            {snelkoppelingen(module).map((pagina) => (
              <li key={pagina.pad}>
                <Link href={pagina.pad}>{pagina.naam}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
