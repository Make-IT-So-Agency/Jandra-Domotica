"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  actievePagina,
  allePaden,
  huisVan,
  paginasVan,
  wisselPad,
  type Menuonderdeel,
  type Paginalink,
} from "@/lib/navigatie";

/**
 * Het menu links, met de pagina's in groepen. Op een smal scherm schuift het
 * over de pagina, met de knop Menu in de balk bovenaan. Een link volgen,
 * Escape of een tik naast het menu sluit het weer.
 *
 * De pagina's van een link voor de architect of een aannemer (/extern) zijn
 * niet van de app: daar komt geen menu, ook niet voor wie aangemeld is.
 */
export function Zijmenu({
  menu,
  wie,
  rol,
  afmelden,
  children,
}: {
  menu: Menuonderdeel[];
  wie: string;
  rol: string;
  afmelden: ReactNode;
  children: ReactNode;
}) {
  const pad = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pad]);

  useEffect(() => {
    if (!open) return;
    const toets = (gebeurtenis: KeyboardEvent) => {
      if (gebeurtenis.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [open]);

  if (pad.startsWith("/extern/")) return <main className="omhulsel">{children}</main>;

  const actief = actievePagina(pad, allePaden(menu));
  const link = (pagina: Paginalink) => (
    <li key={pagina.pad}>
      <Link href={pagina.pad} aria-current={actief === pagina.pad ? "page" : undefined}>
        {pagina.naam}
      </Link>
    </li>
  );

  return (
    <div className="app">
      <header className="topbalk">
        <Link className="merk" href="/">
          Jandra
        </Link>
        <button
          type="button"
          className="stil menuknop"
          aria-expanded={open}
          aria-controls="zijmenu"
          onClick={() => setOpen((was) => !was)}
        >
          {open ? "Sluiten" : "Menu"}
        </button>
      </header>

      <aside id="zijmenu" className="zijmenu" data-open={open ? "" : undefined}>
        <Link className="merk" href="/">
          Jandra
        </Link>
        <nav aria-label="Hoofdmenu">
          {menu.map((onderdeel) => {
            if (onderdeel.soort === "pagina") {
              return (
                <ul key={onderdeel.pagina.pad} className="menulijst los">
                  {link(onderdeel.pagina)}
                </ul>
              );
            }
            // De groep waarin je zit, staat open; de andere klap je open met een tik.
            const bevat = paginasVan(onderdeel).some((pagina) => pagina.pad === actief);
            if (onderdeel.soort === "groep") {
              return (
                <details key={onderdeel.naam} className="menugroep" open={bevat}>
                  <summary>{onderdeel.naam}</summary>
                  <ul className="menulijst">{onderdeel.paginas.map(link)}</ul>
                </details>
              );
            }
            const huis = huisVan(pad, onderdeel.huizen);
            return (
              <details key={onderdeel.naam} className="menugroep" open={bevat}>
                <summary>{onderdeel.naam}</summary>
                {huis ? (
                  <>
                    <label className="huiskeuze">
                      <span>Huis</span>
                      <select
                        value={huis.id}
                        onChange={(gebeurtenis) => {
                          // Naar hetzelfde onderdeel van het gekozen huis, of zijn overzicht.
                          const gekozen = onderdeel.huizen.find((ander) => String(ander.id) === gebeurtenis.target.value);
                          if (gekozen) router.push(wisselPad(pad, huis, gekozen));
                        }}
                      >
                        {onderdeel.huizen.map((ander) => (
                          <option key={ander.id} value={ander.id}>
                            {ander.naam}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ul className="menulijst">{huis.paginas.map(link)}</ul>
                  </>
                ) : null}
                <ul className="menulijst los">{onderdeel.los.map(link)}</ul>
              </details>
            );
          })}
        </nav>
        <div className="zijmenu-voet">
          <span className="wie">
            {wie}
            <span className="hulp"> · {rol}</span>
          </span>
          {afmelden}
        </div>
      </aside>

      {open ? <div className="zijmenu-laag" aria-hidden="true" onClick={() => setOpen(false)} /> : null}

      <main className="omhulsel">{children}</main>
    </div>
  );
}
