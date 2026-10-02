import { vandaag } from "@/lib/bouw/kalender";
import { CATEGORIEEN_POST, CATEGORIENAMEN_POST, type Factuur, type Offerte, type Post } from "@/lib/bouw/geld";
import type { Planningsitem } from "@/lib/bouw/planning";
import type { Partij } from "@/lib/bouw/types";

import { Partijkeuze, Planningskeuze } from "../keuzes/velden";
import { Documentveld } from "./documentveld";

/** Een bedrag zoals het in een invoerveld hoort: "1.250,50". */
export function bedragVeld(waarde: number | null | undefined): string {
  if (waarde === null || waarde === undefined) return "";
  return waarde.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Postvelden({
  post,
  partijen,
  planning,
  voorvoegsel,
}: {
  post?: Post;
  partijen: Partij[];
  planning: Planningsitem[];
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-naam`}>Naam</label>
          <input id={`${voorvoegsel}-naam`} name="naam" defaultValue={post?.naam ?? ""} required placeholder="Ruwbouw" />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-categorie`}>Categorie</label>
          <select id={`${voorvoegsel}-categorie`} name="categorie" defaultValue={post?.categorie ?? "werken"}>
            {CATEGORIEEN_POST.map((categorie) => (
              <option key={categorie} value={categorie}>
                {CATEGORIENAMEN_POST[categorie]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-raming`}>Raming (€, incl. btw)</label>
          <input
            id={`${voorvoegsel}-raming`}
            name="raming"
            inputMode="decimal"
            defaultValue={bedragVeld(post?.raming)}
            placeholder="85.000"
          />
        </div>
      </div>
      <div className="veldenrij">
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Wie het uitvoert" partijen={partijen} gekozen={post?.partij_id} />
        <Planningskeuze voorvoegsel={voorvoegsel} planning={planning} gekozen={post?.planning_id} label="Taak in de planning" />
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={post?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}

export function Offertevelden({
  offerte,
  partijen,
  voorvoegsel,
  metDocument = false,
}: {
  offerte?: Offerte;
  partijen: Partij[];
  voorvoegsel: string;
  metDocument?: boolean;
}) {
  return (
    <>
      <div className="veldenrij">
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Van" partijen={partijen} gekozen={offerte?.partij_id} />
        <div>
          <label htmlFor={`${voorvoegsel}-bedrag`}>Bedrag (€, incl. btw)</label>
          <input
            id={`${voorvoegsel}-bedrag`}
            name="bedrag"
            inputMode="decimal"
            defaultValue={bedragVeld(offerte?.bedrag)}
            required
            placeholder="92.400,00"
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-omschrijving`}>Omschrijving</label>
          <input id={`${voorvoegsel}-omschrijving`} name="omschrijving" defaultValue={offerte?.omschrijving ?? ""} />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-datum`}>Datum</label>
          <input id={`${voorvoegsel}-datum`} name="datum" type="date" defaultValue={offerte?.datum ?? ""} />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-geldig`}>Geldig tot</label>
          <input id={`${voorvoegsel}-geldig`} name="geldig_tot" type="date" defaultValue={offerte?.geldig_tot ?? ""} />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={offerte?.opmerking ?? ""} />
        </div>
      </div>
      {metDocument ? (
        <div className="veldenrij">
          <Documentveld id={`${voorvoegsel}-pdf`} label="PDF van de offerte" />
        </div>
      ) : null}
    </>
  );
}

export function Factuurvelden({
  factuur,
  posten,
  partijen,
  vennootschappen,
  voorvoegsel,
  vastePost,
}: {
  factuur?: Factuur;
  posten: Post[];
  partijen: Partij[];
  vennootschappen: { id: string; naam: string }[];
  voorvoegsel: string;
  /** Bij de facturen van één post: geen keuze. */
  vastePost?: Post;
}) {
  const creditnota = (factuur?.bedrag ?? 0) < 0;
  return (
    <>
      <div className="veldenrij">
        {vastePost ? (
          <input type="hidden" name="post_id" value={vastePost.id} />
        ) : (
          <div>
            <label htmlFor={`${voorvoegsel}-post`}>Post</label>
            <select id={`${voorvoegsel}-post`} name="post_id" defaultValue={factuur?.post_id ?? ""}>
              <option value="">— geen post —</option>
              {posten.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.naam}
                </option>
              ))}
            </select>
          </div>
        )}
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Van" partijen={partijen} gekozen={factuur?.partij_id ?? vastePost?.partij_id} />
        <div>
          <label htmlFor={`${voorvoegsel}-nummer`}>Factuurnummer</label>
          <input id={`${voorvoegsel}-nummer`} name="nummer" defaultValue={factuur?.nummer ?? ""} placeholder="2026-031" />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-bedrag`}>Bedrag (€, incl. btw)</label>
          <input
            id={`${voorvoegsel}-bedrag`}
            name="bedrag"
            inputMode="decimal"
            defaultValue={factuur ? bedragVeld(Math.abs(factuur.bedrag)) : ""}
            required
            placeholder="12.100,00"
          />
          <label className="keuzevak">
            <input type="checkbox" name="creditnota" value="ja" defaultChecked={creditnota} /> Creditnota
          </label>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-factuurdatum`}>Factuurdatum</label>
          <input
            id={`${voorvoegsel}-factuurdatum`}
            name="factuurdatum"
            type="date"
            defaultValue={factuur?.factuurdatum ?? vandaag()}
            required
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-vervaldag`}>Vervaldag</label>
          <input id={`${voorvoegsel}-vervaldag`} name="vervaldag" type="date" defaultValue={factuur?.vervaldag ?? ""} />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-betaald`}>Betaald op</label>
          <input id={`${voorvoegsel}-betaald`} name="betaald_op" type="date" defaultValue={factuur?.betaald_op ?? ""} />
        </div>
        {vennootschappen.length > 0 ? (
          <div>
            <label htmlFor={`${voorvoegsel}-vennootschap`}>Ten laste van</label>
            <select id={`${voorvoegsel}-vennootschap`} name="vennootschap_id" defaultValue={factuur?.vennootschap_id ?? ""}>
              <option value="">wijzelf</option>
              {vennootschappen.map((vennootschap) => (
                <option key={vennootschap.id} value={vennootschap.id}>
                  {vennootschap.naam}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={`${voorvoegsel}-omschrijving`}>Omschrijving</label>
          <input id={`${voorvoegsel}-omschrijving`} name="omschrijving" defaultValue={factuur?.omschrijving ?? ""} placeholder="Voorschot 2" />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={factuur?.opmerking ?? ""} />
        </div>
        {factuur ? null : <Documentveld id={`${voorvoegsel}-pdf`} label="PDF van de factuur" />}
      </div>
    </>
  );
}
