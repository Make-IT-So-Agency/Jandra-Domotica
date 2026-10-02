import Link from "next/link";
import { notFound } from "next/navigation";

import { GeenToegang } from "@/components/geen-toegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { dagVan, dagkop } from "@/lib/bouw/werf";
import { fotoUrls, laadPlaatsen, ruimtenaamIn } from "@/lib/bouw/werf-laden";
import { leesWerffoto, lijstWerffotos } from "@/lib/bouw/werf-opslag";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../../bevestig-knop";
import { Melding } from "../../../melding";
import { verwijderWerffotoActie, wijzigWerffotoActie } from "../../acties";
import { Plaatskeuze } from "../../plaatskeuze";

export const dynamic = "force-dynamic";

const uur = (tijd: string) =>
  new Date(tijd).toLocaleTimeString("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });

export default async function Fotopagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const [{ id }, { melding, soort }] = await Promise.all([params, searchParams]);
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const fotoId = leesId(id);
  const foto = fotoId ? await leesWerffoto(fotoId) : null;
  if (!foto) notFound();

  const [plaatsen, alle, groot] = await Promise.all([laadPlaatsen(), lijstWerffotos(), fotoUrls([foto], true)]);
  const url = groot.get(foto.id) ?? null;
  const ruimtenaam = ruimtenaamIn(plaatsen);
  // Bladeren in volgorde van nemen, zoals in een fotoalbum: ouder links, nieuwer rechts.
  const volgorde = [...alle].sort((a, b) => a.genomen_op.localeCompare(b.genomen_op) || a.id - b.id);
  const plaats = volgorde.findIndex((f) => f.id === foto.id);
  const vorige = plaats > 0 ? volgorde[plaats - 1] : null;
  const volgende = plaats >= 0 && plaats < volgorde.length - 1 ? volgorde[plaats + 1] : null;
  const dag = dagVan(foto.genomen_op);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href="/bouw/werf">← Werf</Link>
      </p>
      <h1>{foto.onderschrift ?? `Foto van ${dagkop(dag, vandaag())}`}</h1>
      <p className="inleiding">
        {dagkop(dag, vandaag())} om {uur(foto.genomen_op)}
        {foto.ruimte_id ? (
          <>
            {" · "}
            <Link href={`/bouw/werf?ruimte=${foto.ruimte_id}`}>{ruimtenaam(foto.ruimte_id) ?? "ruimte"}</Link>
          </>
        ) : null}
        {foto.door ? ` · ${foto.door}` : ""}
        {foto.dagboek_id ? (
          <>
            {" · "}
            <Link href={`/bouw/werf/dagboek#dag-${foto.dagboek_id}`}>dagboek</Link>
          </>
        ) : null}
      </p>

      <Melding soort={soort} melding={melding} />

      <figure className="werffoto">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={foto.onderschrift ?? "Foto van de werf"} />
          </a>
        ) : (
          <div className="kaart">
            <p className="leeg">Deze foto is er niet meer.</p>
          </div>
        )}
      </figure>
      <nav className="knoppenrij bladeren" aria-label="Bladeren">
        {vorige ? (
          <Link className="knop stil" href={`/bouw/werf/foto/${vorige.id}`}>
            ‹ Vorige
          </Link>
        ) : null}
        {volgende ? (
          <Link className="knop stil" href={`/bouw/werf/foto/${volgende.id}`}>
            Volgende ›
          </Link>
        ) : null}
      </nav>

      <h2>Onderschrift en plaats</h2>
      <form action={wijzigWerffotoActie} className="kaart">
        <input type="hidden" name="foto_id" value={foto.id} />
        <div className="veldenrij">
          <div>
            <label htmlFor="foto-onderschrift">Onderschrift</label>
            <input
              id="foto-onderschrift"
              name="onderschrift"
              defaultValue={foto.onderschrift ?? ""}
              maxLength={500}
              placeholder="Leidingen in de muur naast het raam"
            />
          </div>
        </div>
        <Plaatskeuze
          plaatsen={plaatsen}
          start={{ verdieping_id: foto.verdieping_id, ruimte_id: foto.ruimte_id, x_m: foto.x_m, y_m: foto.y_m }}
          uitleg="Tik op de tekening waar je stond of wat de foto toont."
        />
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Bewaren</button>
          <BevestigKnop vraag="Deze foto verwijderen?" formAction={verwijderWerffotoActie}>
            Verwijderen
          </BevestigKnop>
        </div>
      </form>
    </>
  );
}
