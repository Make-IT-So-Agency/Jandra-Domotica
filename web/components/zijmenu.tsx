"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  actieveModule,
  actievePagina,
  allePaden,
  huisVan,
  wisselPad,
  type Menumodule,
  type Menusectie,
  type Paginalink,
} from "@/lib/navigatie";

import { ModuleIcoon } from "./module-icoon";

/**
 * Het menu links, per module. Een smalle balk met een icoon per module, en
 * ernaast een paneel met de pagina's van de module waarin je zit. Heeft
 * iemand maar één module, dan is er geen balk: enkel het paneel.
 *
 * Op een smal scherm wordt de balk een tabbalk onderaan, en schuift het
 * paneel over de pagina met de knop Menu in de balk bovenaan. Een link volgen,
 * Escape of een tik naast het paneel sluit het weer.
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
  menu: Menumodule[];
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
  const module = actieveModule(pad, menu);
  const metBalk = menu.length > 1;

  const link = (pagina: Paginalink) => (
    <li key={pagina.pad}>
      <Link href={pagina.pad} aria-current={actief === pagina.pad ? "page" : undefined}>
        {pagina.naam}
      </Link>
    </li>
  );
  const sectie = (deel: Menusectie, sleutel: string) => (
    <div key={sleutel} className="menusectie">
      {deel.naam ? <h2 className="menukop">{deel.naam}</h2> : null}
      <ul className="menulijst">{deel.paginas.map(link)}</ul>
    </div>
  );
  const modulelink = (item: Menumodule) => (
    <li key={item.id}>
      <Link
        href={item.start}
        className="modulelink"
        aria-current={item.id === module?.id ? "true" : undefined}
        title={item.naam}
      >
        <ModuleIcoon icoon={item.icoon} />
        <span>{item.kort}</span>
      </Link>
    </li>
  );

  const huis = module?.huizen ? huisVan(pad, module.huizen) : null;

  return (
    <div className="app" data-balk={metBalk ? "" : undefined}>
      <header className="topbalk">
        <Link className="merk" href="/">
          Jandra
        </Link>
        {metBalk && module ? <span className="topbalk-module">{module.naam}</span> : null}
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

      {metBalk ? (
        <nav className="modulebalk" aria-label="Modules">
          <Link className="merkteken" href="/" title="Jandra">
            J
          </Link>
          <ul className="modules">{menu.filter((item) => !item.onderaan).map(modulelink)}</ul>
          <ul className="modules onderaan">{menu.filter((item) => item.onderaan).map(modulelink)}</ul>
        </nav>
      ) : null}

      <aside id="zijmenu" className="zijmenu" data-open={open ? "" : undefined}>
        {metBalk ? (
          <div className="paneelkop">{module?.naam}</div>
        ) : (
          <Link className="merk" href="/">
            Jandra
          </Link>
        )}
        <nav aria-label={module?.naam ?? "Menu"}>
          {module?.huizen && huis ? (
            <>
              <label className="huiskeuze">
                <span>Huis</span>
                <select
                  value={huis.id}
                  onChange={(gebeurtenis) => {
                    // Naar hetzelfde onderdeel van het gekozen huis, of zijn overzicht.
                    const gekozen = module.huizen?.find((ander) => String(ander.id) === gebeurtenis.target.value);
                    if (gekozen) router.push(wisselPad(pad, huis, gekozen));
                  }}
                >
                  {module.huizen.map((ander) => (
                    <option key={ander.id} value={ander.id}>
                      {ander.naam}
                    </option>
                  ))}
                </select>
              </label>
              {huis.secties.map((deel, index) => sectie(deel, `huis-${index}`))}
            </>
          ) : null}
          {module?.secties.map((deel, index) => sectie(deel, `sectie-${index}`))}
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
