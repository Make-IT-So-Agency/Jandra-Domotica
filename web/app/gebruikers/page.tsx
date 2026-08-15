import { datumTijd } from "@/lib/format";
import { lijstGebruikers } from "@/lib/gebruikers";
import {
  ROLNAMEN,
  ROLUITLEG,
  isHoofdbeheerder,
  magGebruikerBeheren,
  toewijsbareRollen,
  zichtbareVennootschappen,
} from "@/lib/rollen";
import { db } from "@/lib/supabase";
import { vereistGebruiker } from "@/lib/toegang";
import type { Vennootschap } from "@/lib/types";

import { nodigGebruikerUit, verwijderGebruikerActie, wijzigGebruikerActie } from "./acties";

export const dynamic = "force-dynamic";

export default async function Gebruikerspagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();

  if (toewijsbareRollen(ik).length === 0) {
    return (
      <>
        <h1>Gebruikers</h1>
        <div className="melding let-op">
          Je hebt geen rechten om gebruikers te beheren. Vraag het aan de beheerder van je
          vennootschap.
        </div>
      </>
    );
  }

  const beperking = zichtbareVennootschappen(ik);
  const [gebruikers, vennResultaat] = await Promise.all([
    lijstGebruikers(beperking),
    db().from("companies").select("*").order("name"),
  ]);

  const alleVennootschappen = (vennResultaat.data ?? []) as Vennootschap[];
  // Een vennootschapsbeheerder mag enkel de eigen vennootschap kiezen.
  const kiesbareVennootschappen = isHoofdbeheerder(ik)
    ? alleVennootschappen
    : alleVennootschappen.filter((vennootschap) => vennootschap.id === ik.vennootschap_id);

  const rollen = toewijsbareRollen(ik);

  return (
    <>
      <h1>Gebruikers</h1>
      <p className="inleiding">
        {isHoofdbeheerder(ik)
          ? "Wie toegang heeft tot de app, en tot wat. Iemand toevoegen volstaat: die persoon meldt zich aan met Google op hetzelfde e-mailadres."
          : "Wie van jouw vennootschap toegang heeft tot de app. Iemand toevoegen volstaat: die persoon meldt zich aan met Google op hetzelfde e-mailadres."}
      </p>

      {melding ? (
        <div className={`melding ${soort === "fout" ? "fout" : "goed"}`}>{melding}</div>
      ) : null}

      {gebruikers.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Er is nog niemand toegevoegd.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Persoon</th>
                <th>Rol</th>
                <th>Vennootschap</th>
                <th>Laatst aangemeld</th>
                <th>Wijzigen</th>
              </tr>
            </thead>
            <tbody>
              {gebruikers.map((gebruiker) => {
                const beheerbaar = magGebruikerBeheren(ik, gebruiker);
                const benIkDit = gebruiker.email.toLowerCase() === ik.email.toLowerCase();

                return (
                  <tr key={gebruiker.id}>
                    <td data-label="Persoon">
                      <strong>{gebruiker.naam ?? gebruiker.email}</strong>
                      {gebruiker.naam ? <div className="hulp">{gebruiker.email}</div> : null}
                      {benIkDit ? (
                        <span className="label-vlag goed" style={{ marginTop: 4 }}>
                          jij
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Rol">
                      {ROLNAMEN[gebruiker.rol]}
                      {gebruiker.vasteBeheerder ? (
                        <div className="hulp">vast ingesteld op de server</div>
                      ) : null}
                    </td>
                    <td data-label="Vennootschap">
                      {gebruiker.rol === "hoofdbeheerder"
                        ? "alle vennootschappen"
                        : (gebruiker.vennootschap_naam ?? "—")}
                    </td>
                    <td data-label="Laatst aangemeld">
                      {gebruiker.laatste_aanmelding
                        ? datumTijd(gebruiker.laatste_aanmelding)
                        : "nog nooit"}
                    </td>
                    <td data-label="Wijzigen">
                      {!beheerbaar.toegestaan ? (
                        <span className="hulp">{beheerbaar.reden}</span>
                      ) : gebruiker.vasteBeheerder ? (
                        <span className="hulp">
                          Wijzig dit via TOEGELATEN_EMAILS bij je hosting.
                        </span>
                      ) : (
                        <form action={wijzigGebruikerActie}>
                          <input type="hidden" name="id" value={gebruiker.id} />
                          <div className="veldenrij" style={{ marginBottom: 8 }}>
                            <select
                              name="rol"
                              defaultValue={gebruiker.rol}
                              aria-label={`Rol van ${gebruiker.email}`}
                            >
                              {rollen.map((rol) => (
                                <option key={rol} value={rol}>
                                  {ROLNAMEN[rol]}
                                </option>
                              ))}
                            </select>
                            <select
                              name="vennootschap"
                              defaultValue={gebruiker.vennootschap_id ?? ""}
                              aria-label={`Vennootschap van ${gebruiker.email}`}
                            >
                              <option value="">— alle vennootschappen —</option>
                              {kiesbareVennootschappen.map((vennootschap) => (
                                <option key={vennootschap.id} value={vennootschap.id}>
                                  {vennootschap.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="knoppenrij">
                            <button type="submit">Bewaren</button>
                            <button
                              type="submit"
                              className="gevaar"
                              formAction={verwijderGebruikerActie}
                              formNoValidate
                            >
                              Toegang intrekken
                            </button>
                          </div>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <hr className="scheiding" />

      <h2>Iemand toegang geven</h2>
      {kiesbareVennootschappen.length === 0 && !isHoofdbeheerder(ik) ? (
        <div className="melding let-op">
          Je bent nog aan geen vennootschap gekoppeld. Vraag dat aan de hoofdbeheerder.
        </div>
      ) : (
        <form action={nodigGebruikerUit} className="kaart">
          <div className="veldenrij">
            <div>
              <label htmlFor="email">E-mailadres</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="boekhouder@kantoor.be"
              />
              <p className="hulp">Het adres van hun Google-account.</p>
            </div>
            <div>
              <label htmlFor="rol">Rol</label>
              <select id="rol" name="rol" defaultValue="kijker">
                {rollen.map((rol) => (
                  <option key={rol} value={rol}>
                    {ROLNAMEN[rol]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vennootschap">Vennootschap</label>
              <select
                id="vennootschap"
                name="vennootschap"
                defaultValue={ik.vennootschap_id ?? ""}
              >
                <option value="">— alle vennootschappen (hoofdbeheerder) —</option>
                {kiesbareVennootschappen.map((vennootschap) => (
                  <option key={vennootschap.id} value={vennootschap.id}>
                    {vennootschap.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="kaart" style={{ background: "var(--vlak)", marginBottom: 14 }}>
            {rollen.map((rol) => (
              <p key={rol} className="hulp" style={{ margin: "2px 0" }}>
                <strong>{ROLNAMEN[rol]}</strong> — {ROLUITLEG[rol]}
              </p>
            ))}
          </div>

          <button type="submit">Toegang geven</button>
        </form>
      )}
    </>
  );
}
