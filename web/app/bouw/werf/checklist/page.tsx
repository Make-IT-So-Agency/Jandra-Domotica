import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { lijstRuimtes } from "@/lib/bouw/opslag";
import { checklistVoor } from "@/lib/bouw/werf";
import { laadPlaatsen } from "@/lib/bouw/werf-laden";
import { lijstVinkjes, lijstWerffotos } from "@/lib/bouw/werf-opslag";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Werffotoknop } from "../werffotoknop";
import { Werfmenu } from "../werfmenu";
import { Vinkje } from "./vinkje";

export const dynamic = "force-dynamic";

export default async function Checklistpagina() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const [plaatsen, ruimtes, vinkjes, fotos] = await Promise.all([laadPlaatsen(), lijstRuimtes(), lijstVinkjes(), lijstWerffotos()]);
  const soortVan = new Map(ruimtes.map((ruimte) => [ruimte.id, ruimte.soort]));
  const vinkjeVan = (ruimteId: number, sleutel: string) => vinkjes.find((v) => v.ruimte_id === ruimteId && v.sleutel === sleutel);
  const aantalFotos = (ruimteId: number) => fotos.filter((foto) => foto.ruimte_id === ruimteId).length;
  const metRuimtes = plaatsen.filter((plaats) => plaats.ruimtes.length > 0);

  return (
    <>
      <h1>Checklist vóór alles dichtgaat</h1>
      <p className="inleiding">
        Per ruimte wat je nakijkt en fotografeert vóór het pleisterwerk en de chape. Daarna zit het in de muur of de
        vloer. Elk vinkje wordt meteen bewaard, met wie het zette.
      </p>

      <Werfmenu actief="/bouw/werf/checklist" />

      {metRuimtes.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen ruimtes. Zet eerst de grondplannen om bij Plannen.</p>
        </div>
      ) : (
        metRuimtes.map((plaats) => {
          const totaal = plaats.ruimtes.reduce((som, r) => som + checklistVoor(soortVan.get(r.id) ?? "andere").length, 0);
          const gedaan = plaats.ruimtes.reduce(
            (som, r) => som + checklistVoor(soortVan.get(r.id) ?? "andere").filter((p) => vinkjeVan(r.id, p.sleutel)).length,
            0,
          );
          return (
            <section key={plaats.id}>
              <h2>
                {plaats.naam} <span className="hulp">{gedaan} van {totaal}</span>
              </h2>
              <div className="checklijsten">
                {plaats.ruimtes.map((ruimte) => {
                  const punten = checklistVoor(soortVan.get(ruimte.id) ?? "andere");
                  const klaar = punten.filter((p) => vinkjeVan(ruimte.id, p.sleutel)).length;
                  const fotoTelling = aantalFotos(ruimte.id);
                  return (
                    <div key={ruimte.id} className={`kaart checklijst${klaar === punten.length ? " af" : ""}`}>
                      <h3>
                        {ruimte.naam}{" "}
                        <span className={klaar === punten.length ? "label-vlag goed" : "hulp"}>
                          {klaar} van {punten.length}
                        </span>
                      </h3>
                      <ul>
                        {punten.map((punt) => {
                          const vinkje = vinkjeVan(ruimte.id, punt.sleutel);
                          return (
                            <Vinkje
                              key={punt.sleutel}
                              ruimteId={ruimte.id}
                              sleutel={punt.sleutel}
                              tekst={punt.tekst}
                              gedaan={Boolean(vinkje)}
                              wie={vinkje ? `${vinkje.door ?? "?"}, ${datumTijd(vinkje.gedaan_op)}` : null}
                            />
                          );
                        })}
                      </ul>
                      <div className="knoppenrij" style={{ marginTop: 8 }}>
                        <Werffotoknop standaardRuimte={ruimte.id} groepen={[{ id: plaats.id, naam: plaats.naam, ruimtes: [{ id: ruimte.id, naam: ruimte.naam }] }]} compact label="📷 Foto's" />
                        {fotoTelling > 0 ? (
                          <Link className="knop stil" href={`/bouw/werf?ruimte=${ruimte.id}`}>
                            {fotoTelling === 1 ? "1 foto" : `${fotoTelling} foto's`}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
