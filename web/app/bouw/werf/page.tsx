import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { datum as leesDatum, id as leesId } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { dagkop, perDag } from "@/lib/bouw/werf";
import { fotoUrls, laadPlaatsen, ruimtenaamIn, type Plaatsverdieping } from "@/lib/bouw/werf-laden";
import { lijstWerffotos, type Werffoto } from "@/lib/bouw/werf-opslag";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { Galerij } from "./galerij";
import { Werffotoknop } from "./werffotoknop";
import { Werfmenu } from "./werfmenu";

export const dynamic = "force-dynamic";

/** Zoveel dagen met foto's per pagina: op een gsm is dat al veel scrollen. */
const DAGEN_PER_PAGINA = 10;

export default async function Werfpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; ruimte?: string; voor?: string }>;
}) {
  const { melding, soort, ruimte, voor } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const ruimteId = leesId(ruimte ?? "");
  const voorDag = leesDatum(voor ?? "");
  let plaatsen: Plaatsverdieping[];
  let fotos: Werffoto[];
  try {
    [plaatsen, fotos] = await Promise.all([laadPlaatsen(huis.id), lijstWerffotos(huis.id, ruimteId ? { ruimteId } : {})]);
  } catch (fout) {
    return (
      <>
        <h1>Werf</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const dagen = perDag(fotos).filter((dag) => !voorDag || dag.dag < voorDag);
  const getoond = dagen.slice(0, DAGEN_PER_PAGINA);
  const urls = await fotoUrls(huis.id, getoond.flatMap((dag) => dag.fotos));
  const ruimtenaam = ruimtenaamIn(plaatsen);
  const groepen = plaatsen.map((plaats) => ({
    id: plaats.id,
    naam: plaats.naam,
    ruimtes: plaats.ruimtes.map((r) => ({ id: r.id, naam: r.naam })),
  }));
  const filter = (extra: string) => `/bouw/werf?${[ruimteId ? `ruimte=${ruimteId}` : "", extra].filter(Boolean).join("&")}`;

  return (
    <>
      <h1>Werf</h1>
      <p className="inleiding">
        Foto&apos;s van de werf, per dag en per ruimte. Neem ze vóór alles dichtgaat: later wil je weten waar de
        leidingen in de muur en de vloer zitten.
      </p>

      <Werfmenu actief="/bouw/werf" />
      <Melding soort={soort} melding={melding} />

      <Werffotoknop huisId={huis.id} groepen={groepen} standaardRuimte={ruimteId} />

      <form method="get" className="knoppenrij filter" style={{ margin: "16px 0" }}>
        <label htmlFor="filter-ruimte" className="hulp">
          Toon
        </label>
        <select id="filter-ruimte" name="ruimte" defaultValue={ruimteId ?? ""}>
          <option value="">alle foto&apos;s</option>
          {groepen
            .filter((groep) => groep.ruimtes.length > 0)
            .map((groep) => (
              <optgroup key={groep.id} label={groep.naam}>
                {groep.ruimtes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.naam}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        <button type="submit" className="stil">
          Toon
        </button>
      </form>

      {getoond.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            {ruimteId ? `Nog geen foto's van ${ruimtenaam(ruimteId) ?? "deze ruimte"}.` : "Nog geen foto's."}
          </p>
        </div>
      ) : (
        getoond.map((dag) => (
          <section key={dag.dag}>
            <h2>
              {dagkop(dag.dag, nu)} <span className="hulp">{dag.fotos.length === 1 ? "1 foto" : `${dag.fotos.length} foto's`}</span>
            </h2>
            <Galerij fotos={dag.fotos} urls={urls} ruimtenaam={ruimtenaam} />
          </section>
        ))
      )}

      {dagen.length > DAGEN_PER_PAGINA ? (
        <p>
          <Link href={filter(`voor=${getoond.at(-1)!.dag}`)}>Oudere foto&apos;s →</Link>
        </p>
      ) : null}
      {voorDag ? (
        <p>
          <Link href={filter("")}>← De laatste foto&apos;s</Link>
        </p>
      ) : null}
    </>
  );
}
