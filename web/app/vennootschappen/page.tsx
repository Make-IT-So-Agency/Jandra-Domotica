import { db } from "@/lib/supabase";
import type { Vennootschap } from "@/lib/types";

import { bewerkVennootschap, verwijderVennootschap, voegVennootschapToe } from "./acties";

export const dynamic = "force-dynamic";

export default async function Vennootschappenpagina() {
  const { data, error } = await db().from("companies").select("*").order("name");

  if (error) {
    return (
      <>
        <h1>Vennootschappen</h1>
        <div className="melding fout">{error.message}</div>
      </>
    );
  }

  const vennootschappen = (data ?? []) as Vennootschap[];

  return (
    <>
      <h1>Vennootschappen</h1>
      <p className="inleiding">
        De vennootschappen die hun deel van de laadkosten terugbetalen. Naam, btw-nummer en
        adres komen op het rapport terecht.
      </p>

      {vennootschappen.map((vennootschap) => (
        <form key={vennootschap.id} action={bewerkVennootschap} className="kaart">
          <input type="hidden" name="id" value={vennootschap.id} />
          <div className="veldenrij">
            <div>
              <label htmlFor={`naam-${vennootschap.id}`}>Naam</label>
              <input
                id={`naam-${vennootschap.id}`}
                name="naam"
                defaultValue={vennootschap.name}
                required
              />
            </div>
            <div>
              <label htmlFor={`btw-${vennootschap.id}`}>Btw-nummer</label>
              <input
                id={`btw-${vennootschap.id}`}
                name="btw_nummer"
                defaultValue={vennootschap.vat_number ?? ""}
                placeholder="BE0123.456.789"
              />
            </div>
            <div>
              <label htmlFor={`email-${vennootschap.id}`}>E-mail</label>
              <input
                id={`email-${vennootschap.id}`}
                name="email"
                type="email"
                defaultValue={vennootschap.email ?? ""}
              />
            </div>
          </div>
          <div className="veldenrij">
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor={`adres-${vennootschap.id}`}>Adres</label>
              <input
                id={`adres-${vennootschap.id}`}
                name="adres"
                defaultValue={vennootschap.address ?? ""}
                placeholder="Straat 1, 9000 Gent"
              />
            </div>
          </div>
          <div className="knoppenrij">
            <button type="submit">Bewaren</button>
            <button
              type="submit"
              className="gevaar"
              formAction={verwijderVennootschap}
              formNoValidate
            >
              Verwijderen
            </button>
          </div>
        </form>
      ))}

      <hr className="scheiding" />

      <h2>Vennootschap toevoegen</h2>
      <form action={voegVennootschapToe} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="nieuw-naam">Naam</label>
            <input id="nieuw-naam" name="naam" required placeholder="Jandra BV" />
          </div>
          <div>
            <label htmlFor="nieuw-btw">Btw-nummer</label>
            <input id="nieuw-btw" name="btw_nummer" placeholder="BE0123.456.789" />
          </div>
          <div>
            <label htmlFor="nieuw-email">E-mail</label>
            <input id="nieuw-email" name="email" type="email" />
          </div>
        </div>
        <div className="veldenrij">
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="nieuw-adres">Adres</label>
            <input id="nieuw-adres" name="adres" placeholder="Straat 1, 9000 Gent" />
          </div>
        </div>
        <button type="submit">Toevoegen</button>
      </form>
    </>
  );
}
