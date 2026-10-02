import { GeenToegang } from "@/components/geen-toegang";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { PARTIJNAMEN, SOORTEN_PARTIJ, type Partij } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { verwijderPartijActie, voegPartijToeActie, wijzigPartijActie } from "./acties";

export const dynamic = "force-dynamic";

/** Een website zonder https:// werkt niet als link. */
function alsLink(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function Velden({ partij, voorvoegsel }: { partij?: Partij; voorvoegsel: string }) {
  const tekstveld = (naam: keyof Partij, label: string, opties: { type?: string; placeholder?: string } = {}) => (
    <div>
      <label htmlFor={`${voorvoegsel}-${naam}`}>{label}</label>
      <input
        id={`${voorvoegsel}-${naam}`}
        name={naam}
        type={opties.type ?? "text"}
        defaultValue={(partij?.[naam] as string | null | undefined) ?? ""}
        placeholder={opties.placeholder}
      />
    </div>
  );

  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-soort`}>Soort</label>
          <select id={`${voorvoegsel}-soort`} name="soort" defaultValue={partij?.soort ?? "aannemer"}>
            {SOORTEN_PARTIJ.map((soort) => (
              <option key={soort} value={soort}>
                {PARTIJNAMEN[soort]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-naam`}>Naam</label>
          <input id={`${voorvoegsel}-naam`} name="naam" defaultValue={partij?.naam ?? ""} required />
        </div>
        {tekstveld("vak", "Vak", { placeholder: "ruwbouw, elektriciteit, EPB…" })}
      </div>
      <div className="veldenrij">
        {tekstveld("contactpersoon", "Contactpersoon")}
        {tekstveld("email", "E-mail", { type: "email" })}
        {tekstveld("telefoon", "Telefoon", { type: "tel" })}
      </div>
      <div className="veldenrij">
        {tekstveld("adres", "Adres")}
        {tekstveld("website", "Website")}
        {tekstveld("btw_nummer", "Btw-nummer", { placeholder: "BE0123.456.789" })}
      </div>
      <div className="veldenrij">
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <textarea id={`${voorvoegsel}-opmerking`} name="opmerking" rows={2} defaultValue={partij?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}

export default async function Partijenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let partijen: Partij[];
  try {
    partijen = await lijstPartijen();
  } catch (fout) {
    return (
      <>
        <h1>Partijen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  return (
    <>
      <h1>Partijen</h1>
      <p className="inleiding">
        Iedereen met wie we voor de bouw te maken hebben: de architect, de aannemers, de
        leveranciers, de adviseurs, de nutsbedrijven en de bank.
      </p>

      <Melding soort={soort} melding={melding} />

      {partijen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen partijen. Begin met de architect.</p>
        </div>
      ) : (
        <div className="partijen">
          {partijen.map((partij) => (
            <details key={partij.id} className="kaart partij">
              <summary>
                <span className="partij-naam">{partij.naam}</span>
                <span className="hulp">
                  {PARTIJNAMEN[partij.soort]}
                  {partij.vak ? ` · ${partij.vak}` : ""}
                  {partij.contactpersoon ? ` · ${partij.contactpersoon}` : ""}
                </span>
              </summary>
              <p className="partij-contact">
                {partij.telefoon ? <a href={`tel:${partij.telefoon.replace(/\s/g, "")}`}>{partij.telefoon}</a> : null}
                {partij.email ? <a href={`mailto:${partij.email}`}>{partij.email}</a> : null}
                {partij.website ? (
                  <a href={alsLink(partij.website)} target="_blank" rel="noreferrer">
                    {partij.website}
                  </a>
                ) : null}
              </p>
              <form action={wijzigPartijActie}>
                <input type="hidden" name="id" value={partij.id} />
                <Velden partij={partij} voorvoegsel={`p${partij.id}`} />
                <div className="knoppenrij">
                  <button type="submit">Bewaren</button>
                  <button type="submit" className="gevaar" formAction={verwijderPartijActie} formNoValidate>
                    Verwijderen
                  </button>
                </div>
              </form>
            </details>
          ))}
        </div>
      )}

      <hr className="scheiding" />

      <h2>Partij toevoegen</h2>
      <form action={voegPartijToeActie} className="kaart">
        <Velden voorvoegsel="nieuw" />
        <button type="submit">Toevoegen</button>
      </form>
    </>
  );
}
