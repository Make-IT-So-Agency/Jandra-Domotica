"use client";

import { useState } from "react";

import type { PeriodeOptie } from "@/lib/periods";

/**
 * Eén keuzelijst met vooringestelde periodes.
 *
 * De vrije datums staan er bewust niet permanent naast: zolang je een kwartaal
 * of een maand kiest, doen ze niets, en twee velden die niets doen zijn een
 * bron van twijfel. Ze verschijnen pas bij "Zelf gekozen datums".
 */
export function PeriodeKiezer({
  opties,
  gekozen,
  van,
  tot,
}: {
  opties: PeriodeOptie[];
  gekozen: string;
  van: string;
  tot: string;
}) {
  const [waarde, setWaarde] = useState(gekozen);
  const groepen = [...new Set(opties.map((optie) => optie.groep))];

  return (
    <>
      <div>
        <label htmlFor="periode">Periode</label>
        <select
          id="periode"
          name="periode"
          value={waarde}
          onChange={(gebeurtenis) => setWaarde(gebeurtenis.target.value)}
        >
          {groepen.map((groep) => (
            <optgroup key={groep} label={groep}>
              {opties
                .filter((optie) => optie.groep === groep)
                .map((optie) => (
                  <option key={optie.waarde} value={optie.waarde}>
                    {optie.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {waarde === "vrij" ? (
        <>
          <div>
            <label htmlFor="van">Van</label>
            <input id="van" name="van" type="date" defaultValue={van} required />
          </div>
          <div>
            <label htmlFor="tot">Tot en met</label>
            <input id="tot" name="tot" type="date" defaultValue={tot} required />
          </div>
        </>
      ) : (
        // Onthouden wat er ingevuld stond, zodat terugschakelen niets wist.
        <>
          <input type="hidden" name="van" value={van} />
          <input type="hidden" name="tot" value={tot} />
        </>
      )}
    </>
  );
}
