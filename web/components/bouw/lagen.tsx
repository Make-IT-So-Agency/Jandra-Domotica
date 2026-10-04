"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { isAan, leesLagen, metWijziging, type Lagengroep, type Lagenstand } from "@/lib/bouw/drie/lagen";

/**
 * De lagen: welke aan staan, onthouden per browser, en de vinkjes om ze aan
 * en uit te zetten. Zie lib/bouw/drie/lagen.ts.
 */

const SLEUTEL = "jandra.lagen";
const luisteraars = new Set<() => void>();
/** Als de browser niets mag bewaren (privévenster), onthouden we het zolang de pagina open is. */
let geheugen: string | null = null;

function lees(): string | null {
  try {
    return window.localStorage.getItem(SLEUTEL) ?? geheugen;
  } catch {
    return geheugen;
  }
}

function volg(luisteraar: () => void) {
  luisteraars.add(luisteraar);
  // Een ander tabblad dat iets aan- of uitzet.
  const opOpslag = (e: StorageEvent) => {
    if (e.key === SLEUTEL) luisteraar();
  };
  window.addEventListener("storage", opOpslag);
  return () => {
    luisteraars.delete(luisteraar);
    window.removeEventListener("storage", opOpslag);
  };
}

/** De stand van de lagen, en een functie om er een of meer aan of uit te zetten. */
export function useLagen(): [Lagenstand, (wijziging: Readonly<Record<string, boolean>>) => void] {
  const tekst = useSyncExternalStore(volg, lees, () => null);
  const stand = useMemo(() => leesLagen(tekst), [tekst]);
  const zet = useCallback((wijziging: Readonly<Record<string, boolean>>) => {
    geheugen = JSON.stringify(metWijziging(leesLagen(lees()), wijziging));
    try {
      window.localStorage.setItem(SLEUTEL, geheugen);
    } catch {
      // Geen opslag: dan blijft het in het geheugen tot de pagina sluit.
    }
    luisteraars.forEach((luisteraar) => luisteraar());
  }, []);
  return [stand, zet];
}

/** Per groep een vinkje voor de hele groep, en een per laag. */
export function Lagenkeuze({
  groepen,
  stand,
  zet,
}: {
  groepen: readonly Lagengroep[];
  stand: Lagenstand;
  zet: (wijziging: Readonly<Record<string, boolean>>) => void;
}) {
  return (
    <>
      {groepen.map((groep) => {
        const aan = groep.lagen.filter((laag) => isAan(stand, laag.sleutel)).length;
        return (
          <fieldset key={groep.naam} className="lagengroep">
            <legend>
              <label className="keuzevak">
                <input
                  type="checkbox"
                  checked={aan === groep.lagen.length}
                  ref={(vak) => {
                    if (vak) vak.indeterminate = aan > 0 && aan < groep.lagen.length;
                  }}
                  onChange={(g) => zet(Object.fromEntries(groep.lagen.map((laag) => [laag.sleutel, g.currentTarget.checked])))}
                />
                {groep.naam}
              </label>
            </legend>
            {groep.lagen.map((laag) => (
              <label key={laag.sleutel} className="keuzevak laag">
                <input type="checkbox" checked={isAan(stand, laag.sleutel)} onChange={(g) => zet({ [laag.sleutel]: g.currentTarget.checked })} />
                {laag.kleur ? <span className="laagkleur" style={{ background: laag.kleur }} aria-hidden="true" /> : null}
                {laag.naam}
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
