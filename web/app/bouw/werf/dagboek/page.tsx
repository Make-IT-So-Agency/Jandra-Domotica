import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { datum as leesDatum } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { dagVan, dagkop } from "@/lib/bouw/werf";
import { fotoUrls, laadPlaatsen, ruimtenaamIn } from "@/lib/bouw/werf-laden";
import { lijstDagboek, lijstWerffotos, type Dagboekdag } from "@/lib/bouw/werf-opslag";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Melding } from "../../melding";
import { verwijderDagboekActie, voegDagboekToeActie, wijzigDagboekActie } from "../acties";
import { Galerij } from "../galerij";
import { Werffotoknop } from "../werffotoknop";
import { Werfmenu } from "../werfmenu";

export const dynamic = "force-dynamic";

const PER_PAGINA = 15;

function Dagvelden({ dag, voorvoegsel, nu }: { dag?: Dagboekdag; voorvoegsel: string; nu: string }) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-datum`}>Dag</label>
          <input id={`${voorvoegsel}-datum`} name="datum" type="date" max={nu} defaultValue={dag?.datum ?? nu} required />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-weer`}>Weer</label>
          <input id={`${voorvoegsel}-weer`} name="weer" defaultValue={dag?.weer ?? ""} placeholder="droog, 14 °C" />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-aanwezig`}>Wie was er</label>
          <input id={`${voorvoegsel}-aanwezig`} name="aanwezig" defaultValue={dag?.aanwezig ?? ""} placeholder="metsers (3), elektricien" />
        </div>
      </div>
      <div>
        <label htmlFor={`${voorvoegsel}-tekst`}>Wat er gebeurde</label>
        <textarea
          id={`${voorvoegsel}-tekst`}
          name="tekst"
          rows={4}
          defaultValue={dag?.tekst ?? ""}
          required
          placeholder="Bekisting voor de kelder geplaatst; de pomp voor de bemaling draait."
        />
      </div>
    </>
  );
}

export default async function Dagboekpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; voor?: string }>;
}) {
  const { melding, soort, voor } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const voorDag = leesDatum(voor ?? "");
  const [dagen, fotos, plaatsen] = await Promise.all([lijstDagboek(huis.id), lijstWerffotos(huis.id), laadPlaatsen(huis.id)]);
  const nu = vandaag();
  const reeks = dagen.filter((dag) => !voorDag || dag.datum < voorDag);
  const getoond = reeks.slice(0, PER_PAGINA);

  // De foto's van een dag: die bij deze dag gezet werden, en die op die dag genomen werden.
  const fotosVan = (dag: Dagboekdag) =>
    fotos
      .filter((foto) => foto.dagboek_id === dag.id || (foto.dagboek_id === null && dagVan(foto.genomen_op) === dag.datum))
      .sort((a, b) => a.genomen_op.localeCompare(b.genomen_op));
  const urls = await fotoUrls(huis.id, getoond.flatMap(fotosVan));
  const ruimtenaam = ruimtenaamIn(plaatsen);

  return (
    <>
      <h1>Werfdagboek</h1>
      <p className="inleiding">
        Per dag wat er gebeurde, wie er was en het weer. De foto&apos;s van die dag komen er vanzelf bij.
      </p>

      <Werfmenu actief="/bouw/werf/dagboek" />
      <Melding soort={soort} melding={melding} />

      <details className="kaart" open={dagen.length === 0}>
        <summary>Een dag toevoegen</summary>
        <form action={voegDagboekToeActie.bind(null, huis.id)} style={{ marginTop: 12 }}>
          <Dagvelden voorvoegsel="nieuw" nu={nu} />
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Bewaren</button>
          </div>
        </form>
      </details>

      {getoond.length === 0 ? (
        <div className="kaart" style={{ marginTop: 16 }}>
          <p className="leeg">Het dagboek is nog leeg.</p>
        </div>
      ) : (
        <ol className="dagboek">
          {getoond.map((dag) => {
            const eigen = fotosVan(dag);
            return (
              <li key={dag.id} id={`dag-${dag.id}`} className="kaart">
                <h2>{dagkop(dag.datum, nu)}</h2>
                <p className="hulp">
                  {[dag.weer, dag.aanwezig ? `aanwezig: ${dag.aanwezig}` : null, dag.door].filter(Boolean).join(" · ")}
                </p>
                <p className="dagboek-tekst">{dag.tekst}</p>
                {eigen.length > 0 ? <Galerij fotos={eigen} urls={urls} ruimtenaam={ruimtenaam} /> : null}
                <div className="knoppenrij" style={{ marginTop: 8 }}>
                  <Werffotoknop huisId={huis.id} dagboekId={dag.id} compact label="📷 Foto's bij deze dag" />
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary className="hulp">Wijzigen</summary>
                  <form action={wijzigDagboekActie.bind(null, huis.id)} style={{ marginTop: 8 }}>
                    <input type="hidden" name="dag_id" value={dag.id} />
                    <Dagvelden dag={dag} voorvoegsel={`dag-${dag.id}`} nu={nu} />
                    <div className="knoppenrij" style={{ marginTop: 12 }}>
                      <button type="submit">Bewaren</button>
                      <BevestigKnop
                        vraag="Deze dag uit het dagboek halen? De foto's blijven."
                        formAction={verwijderDagboekActie.bind(null, huis.id)}
                      >
                        Verwijderen
                      </BevestigKnop>
                    </div>
                  </form>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {reeks.length > PER_PAGINA ? (
        <p>
          <Link href={`/bouw/werf/dagboek?voor=${getoond.at(-1)!.datum}`}>Oudere dagen →</Link>
        </p>
      ) : null}
      {voorDag ? (
        <p>
          <Link href="/bouw/werf/dagboek">← De laatste dagen</Link>
        </p>
      ) : null}
    </>
  );
}
