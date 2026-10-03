import {
  EENHEIDNAMEN,
  euroRond,
  meerprijsTekst,
  type Eenheid,
  type Optie,
  type Optieprijs,
  type Voorkeur,
} from "@/lib/bouw/keuzes";
import type { Partij } from "@/lib/bouw/types";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import {
  beslisActie,
  verwijderFotoActie,
  verwijderOptieActie,
  voorkeurActie,
  wijzigOptieActie,
  zetBasisActie,
} from "../acties";
import { Optievelden } from "../velden";
import { Fotoknop } from "./fotoknop";

/** Eén optie van een keuze: foto, prijs, meerprijs, wie ze verkiest, en wat je ermee kan. */
export function Optiekaart({
  huisId,
  optie,
  keuze,
  prijs,
  fans,
  foto,
  mijnVoorkeur,
  leverancier,
  heeftBasis,
  aantalOpties,
  partijen,
}: {
  huisId: number;
  optie: Optie;
  keuze: { gekozen_optie_id: number | null; eenheid: Eenheid };
  prijs: Optieprijs | undefined;
  fans: Voorkeur[];
  /** Een ondertekende URL, of null. */
  foto: string | null;
  mijnVoorkeur: number | null;
  leverancier: string | null;
  heeftBasis: boolean;
  aantalOpties: number;
  partijen: Partij[];
}) {
  return (
    <article className={`kaart optie${optie.id === keuze.gekozen_optie_id ? " gekozen" : ""}`}>
      {foto ? (
        <a href={foto} target="_blank" rel="noreferrer" className="optie-foto">
          <img src={foto} alt={optie.naam} loading="lazy" />
        </a>
      ) : optie.kleur ? (
        <div className="optie-foto kleurstaal" style={{ background: optie.kleur }} aria-hidden="true" />
      ) : null}
      <h3>
        {optie.naam}{" "}
        {optie.id === keuze.gekozen_optie_id ? <span className="label-vlag goed">Gekozen</span> : null}
        {optie.basis ? <span className="label-vlag">Basis</span> : null}
      </h3>
      {leverancier ? <p className="hulp">{leverancier}</p> : null}
      <p>
        {optie.prijs === null ? (
          <span className="hulp">Nog geen prijs</span>
        ) : (
          <>
            {euroRond(optie.prijs)} {keuze.eenheid === "totaal" ? "" : EENHEIDNAMEN[keuze.eenheid]}
            {keuze.eenheid !== "totaal" && prijs?.kost !== null && prijs?.kost !== undefined ? (
              <span className="hulp"> · {euroRond(prijs.kost)} in totaal</span>
            ) : null}
          </>
        )}
      </p>
      {prijs?.meerprijs !== null && prijs?.meerprijs !== undefined && aantalOpties > 1 ? (
        <p className={prijs.isReferentie ? "hulp" : "meerprijs"}>
          {prijs.isReferentie
            ? heeftBasis
              ? "De basis"
              : "De goedkoopste"
            : `${meerprijsTekst(prijs.meerprijs)} tegenover ${heeftBasis ? "de basis" : "de goedkoopste"}`}
        </p>
      ) : null}
      {optie.opmerking ? <p className="hulp">{optie.opmerking}</p> : null}
      {optie.url ? (
        <p>
          <a href={optie.url} target="_blank" rel="noreferrer">
            Productpagina
          </a>
        </p>
      ) : null}
      <p className="voorkeuren">
        {fans.length > 0 ? fans.map((voorkeur) => <span key={voorkeur.wie}>♥ {voorkeur.naam}</span>) : null}
      </p>

      <form className="knoppenrij">
        <input type="hidden" name="id" value={optie.id} />
        <button type="submit" className="stil" formAction={voorkeurActie.bind(null, huisId)}>
          {mijnVoorkeur === optie.id ? "Niet meer mijn voorkeur" : "Mijn voorkeur"}
        </button>
        {optie.id !== keuze.gekozen_optie_id ? (
          <BevestigKnop
            vraag={`${optie.naam} definitief kiezen? Het komt in het beslissingslog.`}
            formAction={beslisActie.bind(null, huisId)}
            className=""
          >
            Kies deze
          </BevestigKnop>
        ) : null}
        <button type="submit" className="stil" formAction={zetBasisActie.bind(null, huisId)}>
          {optie.basis ? "Geen basis" : "Basis"}
        </button>
      </form>

      <Fotoknop huisId={huisId} optieId={optie.id} heeftFoto={!!optie.foto_bestand_id} />

      <details className="optie-wijzigen">
        <summary>Wijzigen</summary>
        <form action={wijzigOptieActie.bind(null, huisId)}>
          <input type="hidden" name="id" value={optie.id} />
          <Optievelden optie={optie} eenheid={keuze.eenheid} partijen={partijen} voorvoegsel={`o${optie.id}`} />
          <div className="knoppenrij">
            <button type="submit">Bewaren</button>
            {optie.foto_bestand_id ? (
              <button type="submit" className="stil" formAction={verwijderFotoActie.bind(null, huisId)} formNoValidate>
                Foto weghalen
              </button>
            ) : null}
            <BevestigKnop vraag={`${optie.naam} verwijderen?`} formAction={verwijderOptieActie.bind(null, huisId)}>
              Verwijderen
            </BevestigKnop>
          </div>
        </form>
      </details>
    </article>
  );
}
