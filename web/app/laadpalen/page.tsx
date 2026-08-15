import Link from "next/link";

import { db } from "@/lib/supabase";
import type { Laadpaal, Vennootschap } from "@/lib/types";

import { bewaarKoppelingen } from "./acties";
import { GeenToegang } from "@/components/geen-toegang";
import { magInstellingenBeheren } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

export const dynamic = "force-dynamic";

const REGIOS = [
  { waarde: "vlaanderen", naam: "Vlaanderen" },
  { waarde: "brussel", naam: "Brussel" },
  { waarde: "wallonie", naam: "Wallonië" },
];

export default async function Laadpalenpagina() {
  const ik = await vereistGebruiker();
  if (!magInstellingenBeheren(ik)) return <GeenToegang wat="Laadpalen koppelen" />;

  const [palenResultaat, vennResultaat] = await Promise.all([
    db().from("loadpoints").select("*").order("name"),
    db().from("companies").select("*").order("name"),
  ]);

  if (palenResultaat.error || vennResultaat.error) {
    return (
      <>
        <h1>Laadpalen</h1>
        <div className="melding fout">
          {palenResultaat.error?.message ?? vennResultaat.error?.message}
        </div>
      </>
    );
  }

  const laadpalen = (palenResultaat.data ?? []) as Laadpaal[];
  const vennootschappen = (vennResultaat.data ?? []) as Vennootschap[];

  return (
    <>
      <h1>Laadpalen</h1>
      <p className="inleiding">
        Elke laadpaal hoort bij één vennootschap. Alles wat op die paal geladen wordt, komt
        op het rapport van die vennootschap. Nieuwe palen verschijnen hier vanzelf zodra
        Home Assistant er een sessie van doorstuurt.
      </p>

      {vennootschappen.length === 0 ? (
        <div className="melding let-op">
          Voeg eerst je vennootschappen toe bij{" "}
          <Link href="/vennootschappen">Vennootschappen</Link>; daarna kan je hier koppelen.
        </div>
      ) : null}

      {laadpalen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen laadpalen bekend. Die verschijnen automatisch na de eerste
            synchronisatie vanuit Home Assistant.
          </p>
        </div>
      ) : (
        <form action={bewaarKoppelingen}>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Naam in evcc</th>
                  <th>Naam op het rapport</th>
                  <th>Vennootschap</th>
                  <th>Gewest</th>
                </tr>
              </thead>
              <tbody>
                {laadpalen.map((laadpaal) => (
                  <tr key={laadpaal.id}>
                    <td data-label="Naam in evcc">
                      <input type="hidden" name="laadpaal_id" value={laadpaal.id} />
                      <strong>{laadpaal.name}</strong>
                    </td>
                    <td data-label="Naam op het rapport">
                      <input
                        name={`naam-${laadpaal.id}`}
                        defaultValue={laadpaal.display_name ?? ""}
                        placeholder={laadpaal.name}
                        aria-label={`Weergavenaam voor ${laadpaal.name}`}
                      />
                    </td>
                    <td data-label="Vennootschap">
                      <select
                        name={`vennootschap-${laadpaal.id}`}
                        defaultValue={laadpaal.company_id ?? ""}
                        aria-label={`Vennootschap voor ${laadpaal.name}`}
                      >
                        <option value="">— nog niet gekoppeld —</option>
                        {vennootschappen.map((vennootschap) => (
                          <option key={vennootschap.id} value={vennootschap.id}>
                            {vennootschap.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Gewest">
                      <select
                        name={`regio-${laadpaal.id}`}
                        defaultValue={laadpaal.region}
                        aria-label={`Gewest voor ${laadpaal.name}`}
                      >
                        {REGIOS.map((regio) => (
                          <option key={regio.waarde} value={regio.waarde}>
                            {regio.naam}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="knoppenrij" style={{ marginTop: 16 }}>
            <button type="submit">Koppelingen bewaren</button>
          </div>
        </form>
      )}
    </>
  );
}
