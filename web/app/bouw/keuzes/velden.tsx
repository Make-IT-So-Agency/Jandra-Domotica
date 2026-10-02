import { korteDatum } from "@/lib/bouw/kalender";
import {
  CATEGORIEEN_KEUZE,
  CATEGORIENAMEN_KEUZE,
  EENHEDEN,
  EENHEIDNAMEN,
  type Eenheid,
  type Keuze,
  type Optie,
} from "@/lib/bouw/keuzes";
import type { Planningsitem } from "@/lib/bouw/planning";
import { PARTIJNAMEN, type Partij } from "@/lib/bouw/types";

/** De taak (of fase, of mijlpaal) waarvoor een keuze nodig is. */
export function Planningskeuze({
  voorvoegsel,
  planning,
  gekozen = null,
}: {
  voorvoegsel: string;
  planning: Planningsitem[];
  gekozen?: number | null;
}) {
  return (
    <div>
      <label htmlFor={`${voorvoegsel}-planning`}>Nodig voor</label>
      <select id={`${voorvoegsel}-planning`} name="planning_id" defaultValue={gekozen ?? ""}>
        <option value="">— geen taak —</option>
        {planning.map((item) => (
          <option key={item.id} value={item.id}>
            {item.soort === "fase" ? "Fase: " : item.soort === "mijlpaal" ? "Mijlpaal: " : ""}
            {item.titel} · {korteDatum(item.begindatum)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Partijkeuze({
  voorvoegsel,
  naam,
  label,
  partijen,
  gekozen = null,
}: {
  voorvoegsel: string;
  naam: string;
  label: string;
  partijen: Partij[];
  gekozen?: number | null;
}) {
  return (
    <div>
      <label htmlFor={`${voorvoegsel}-${naam}`}>{label}</label>
      <select id={`${voorvoegsel}-${naam}`} name={naam} defaultValue={gekozen ?? ""}>
        <option value="">—</option>
        {partijen.map((partij) => (
          <option key={partij.id} value={partij.id}>
            {partij.naam} ({PARTIJNAMEN[partij.soort].toLowerCase()})
          </option>
        ))}
      </select>
    </div>
  );
}

export function Keuzevelden({
  keuze,
  planning,
  partijen,
  voorvoegsel,
}: {
  keuze: Keuze;
  planning: Planningsitem[];
  partijen: Partij[];
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-titel`}>Titel</label>
          <input id={`${voorvoegsel}-titel`} name="titel" defaultValue={keuze.titel} required />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-categorie`}>Categorie</label>
          <select id={`${voorvoegsel}-categorie`} name="categorie" defaultValue={keuze.categorie}>
            {CATEGORIEEN_KEUZE.map((categorie) => (
              <option key={categorie} value={categorie}>
                {CATEGORIENAMEN_KEUZE[categorie]}
              </option>
            ))}
          </select>
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Wie het uitvoert" partijen={partijen} gekozen={keuze.partij_id} />
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-deadline`}>Beslissen tegen</label>
          <input id={`${voorvoegsel}-deadline`} name="deadline" type="date" defaultValue={keuze.deadline ?? ""} />
        </div>
        <Planningskeuze voorvoegsel={voorvoegsel} planning={planning} gekozen={keuze.planning_id} />
        <div>
          <label htmlFor={`${voorvoegsel}-levertermijn`}>Levertermijn (weken)</label>
          <input
            id={`${voorvoegsel}-levertermijn`}
            name="levertermijn_weken"
            inputMode="numeric"
            defaultValue={keuze.levertermijn_weken ?? ""}
          />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-eenheid`}>Prijs van een optie</label>
          <select id={`${voorvoegsel}-eenheid`} name="eenheid" defaultValue={keuze.eenheid}>
            {EENHEDEN.map((eenheid) => (
              <option key={eenheid} value={eenheid}>
                {EENHEIDNAMEN[eenheid]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-hoeveelheid`}>Hoeveelheid</label>
          <input
            id={`${voorvoegsel}-hoeveelheid`}
            name="hoeveelheid"
            inputMode="decimal"
            defaultValue={keuze.hoeveelheid === null ? "" : String(keuze.hoeveelheid).replace(".", ",")}
            placeholder="uit de ruimtes"
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-omschrijving`}>Omschrijving</label>
          <input id={`${voorvoegsel}-omschrijving`} name="omschrijving" defaultValue={keuze.omschrijving ?? ""} />
        </div>
      </div>
    </>
  );
}

export function Optievelden({
  optie,
  eenheid,
  partijen,
  voorvoegsel,
}: {
  optie?: Optie;
  eenheid: Eenheid;
  partijen: Partij[];
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-naam`}>Naam</label>
          <input id={`${voorvoegsel}-naam`} name="naam" defaultValue={optie?.naam ?? ""} required placeholder="Merk, type, kleur" />
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="leverancier_id" label="Leverancier" partijen={partijen} gekozen={optie?.leverancier_id ?? null} />
        <div>
          <label htmlFor={`${voorvoegsel}-prijs`}>Prijs incl. btw, {EENHEIDNAMEN[eenheid]}</label>
          <input
            id={`${voorvoegsel}-prijs`}
            name="prijs"
            inputMode="decimal"
            defaultValue={optie?.prijs === null || optie?.prijs === undefined ? "" : String(optie.prijs).replace(".", ",")}
            placeholder="€"
          />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-url`}>Link naar het product</label>
          <input id={`${voorvoegsel}-url`} name="url" type="url" defaultValue={optie?.url ?? ""} placeholder="https://" />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-kleur`}>Kleur voor het 3D-model</label>
          <div className="kleurveld">
            <input type="checkbox" name="met_kleur" value="ja" defaultChecked={!!optie?.kleur} aria-label="Een kleur gebruiken" />
            <input id={`${voorvoegsel}-kleur`} name="kleur" type="color" defaultValue={optie?.kleur ?? "#a0522d"} />
          </div>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={optie?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}
