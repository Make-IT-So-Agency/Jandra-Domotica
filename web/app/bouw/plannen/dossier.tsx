"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { controleerUpload } from "@/lib/bouw/bestanden";
import { controleerAanvraag, koppelBladen, type Bestaandplan, type Dossierblad } from "@/lib/bouw/dossierregels";
import { getal, sleutelVan } from "@/lib/bouw/invoer";
import { stelDossierVoor, verdiepingenUit, type Bladvoorstel } from "@/lib/bouw/omzetting/dossier";
import { leesBladteksten } from "@/lib/bouw/omzetting/lezen";
import { bewaarPdfBytes, openPdf, pdfFout } from "@/lib/bouw/pdf";
import { PLANNAMEN, SOORTEN_PLAN, hoortBijVerdieping, isSoortPlan } from "@/lib/bouw/types";
import { volgendLabel } from "@/lib/bouw/weergave";
import { zetOp } from "@/lib/bouw/zet-op";

import { leesDossierInActie, vraagDossierUploadAan } from "./acties";

export interface Bestaand {
  plannen: Bestaandplan[];
  gebouwen: string[];
  verdiepingen: { gebouw: string; naam: string }[];
}

type Fase =
  | { soort: "kiezen" }
  | { soort: "lezen"; tekst: string }
  | { soort: "nakijken" }
  | { soort: "bezig"; tekst: string; voortgang?: number };

interface Rij extends Bladvoorstel {
  mee: boolean;
}

type Hoogtes = { vloerpeil: string; plafondhoogte: string; verdiepingshoogte: string };

const komma = (waarde: number | null) => (waarde === null ? "" : String(waarde).replace(".", ","));
const verdiepingsleutel = (gebouw: string, naam: string) => `${sleutelVan(gebouw)}|${sleutelVan(naam)}`;

/** De bladen zoals ze naar de server gaan: enkel wat aangevinkt is, netjes ingevuld. */
function alsDossierbladen(rijen: Rij[]): Dossierblad[] {
  return rijen
    .filter((rij) => rij.mee)
    .map((rij) => ({
      pagina: rij.pagina,
      titel: rij.titel.trim(),
      soort: rij.soort,
      gebouw: rij.gebouw?.trim() || null,
      verdieping: hoortBijVerdieping(rij.soort) && rij.gebouw?.trim() ? rij.verdieping?.trim() || null : null,
      bladcode: rij.bladcode,
    }));
}

/**
 * Een dossier inlezen: één PDF met alle bladen. De browser leest eerst de
 * teksten van elk blad (pdf.js, nog vóór het opladen) en stelt per blad een
 * plan voor. Jan en Sandra kijken dat na; pas dan gaat de PDF naar de
 * privé-opslag en worden de plannen, versies en verdiepingen aangemaakt.
 */
export default function Dossier({ bestaand }: { bestaand: Bestaand }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ soort: "kiezen" });
  const [fout, setFout] = useState<string | null>(null);
  const [bestand, setBestand] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [hoogtes, setHoogtes] = useState<Record<string, Partial<Hoogtes>>>({});
  const [label, setLabel] = useState("v1");
  const [datum, setDatum] = useState("");
  const bezig = fase.soort === "lezen" || fase.soort === "bezig";

  const bladen = useMemo(() => alsDossierbladen(rijen), [rijen]);
  const koppeling = useMemo(() => koppelBladen({ label: label.trim(), bladen }, bestaand.plannen), [label, bladen, bestaand]);
  const verdiepingen = useMemo(
    () =>
      verdiepingenUit(
        rijen
          .filter((rij) => rij.mee && rij.gebouw?.trim())
          .map((rij) => ({ ...rij, gebouw: rij.gebouw!.trim(), verdieping: rij.verdieping?.trim() || null })),
      ),
    [rijen],
  );

  async function lees(gekozen: File) {
    setFout(null);
    const controle = controleerUpload({ naam: gekozen.name, type: gekozen.type, grootte: gekozen.size }, "plan");
    if (!controle.ok) return setFout(controle.melding);

    setFase({ soort: "lezen", tekst: "De PDF openen…" });
    const inhoud = new Uint8Array(await gekozen.arrayBuffer());
    const taak = openPdf(inhoud);
    try {
      const pdf = await taak.promise;
      const gelezen = [];
      for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
        setFase({ soort: "lezen", tekst: `Blad ${pagina} van ${pdf.numPages} lezen…` });
        const blad = await pdf.getPage(pagina);
        gelezen.push({ pagina, teksten: (await leesBladteksten(blad)).teksten });
        blad.cleanup();
      }
      const voorstel = stelDossierVoor(gelezen);
      const nieuweRijen = voorstel.bladen.map((blad) => ({ ...blad, mee: true }));
      const gekoppeld = koppelBladen({ label: "", bladen: alsDossierbladen(nieuweRijen) }, bestaand.plannen);
      setLabel(
        volgendLabel(
          gekoppeld.bladen.flatMap((blad) => bestaand.plannen.find((plan) => plan.id === blad.plan?.id)?.labels ?? []),
        ),
      );
      setDatum(voorstel.datum ?? "");
      setRijen(nieuweRijen);
      setHoogtes({});
      setBytes(inhoud);
      setBestand(gekozen);
      setFase({ soort: "nakijken" });
    } catch (oorzaak) {
      setFout(pdfFout(oorzaak));
      setFase({ soort: "kiezen" });
    } finally {
      void taak.destroy();
    }
  }

  function wijzig(pagina: number, velden: Partial<Rij>) {
    setRijen((huidig) => huidig.map((rij) => (rij.pagina === pagina ? { ...rij, ...velden } : rij)));
  }

  function opnieuw() {
    setFase({ soort: "kiezen" });
    setRijen([]);
    setBestand(null);
    setBytes(null);
    setFout(null);
  }

  async function inlezen() {
    if (!bestand || !bytes) return;
    setFout(null);

    // De verdiepingen, met wat er zelf aangepast werd.
    const lijst = [];
    for (const verdieping of verdiepingen) {
      const eigen = hoogtes[verdiepingsleutel(verdieping.gebouw, verdieping.naam)] ?? {};
      const waarde = (veld: keyof Hoogtes, standaard: number | null, wat: string) => {
        if (eigen[veld] === undefined) return standaard;
        const uitkomst = getal(eigen[veld], `${verdieping.gebouw} · ${verdieping.naam}, ${wat}`);
        if (!uitkomst.ok) throw new Error(uitkomst.melding);
        return uitkomst.waarde;
      };
      try {
        lijst.push({
          gebouw: verdieping.gebouw,
          naam: verdieping.naam,
          volgorde: verdieping.volgorde,
          vloerpeil_m: waarde("vloerpeil", verdieping.vloerpeil, "vloerpeil"),
          plafondhoogte_m: waarde("plafondhoogte", verdieping.plafondhoogte, "plafondhoogte"),
          verdiepingshoogte_m: waarde("verdiepingshoogte", verdieping.verdiepingshoogte, "verdiepingshoogte"),
        });
      } catch (oorzaak) {
        return setFout(oorzaak instanceof Error ? oorzaak.message : "Een hoogte klopt niet.");
      }
    }

    const aanvraag = controleerAanvraag({ label, datum: datum || null, bladen, verdiepingen: lijst });
    if (!aanvraag.ok) return setFout(aanvraag.melding);

    setFase({ soort: "bezig", tekst: "Voorbereiden…" });
    const toelating = await vraagDossierUploadAan({
      aanbod: { naam: bestand.name, type: bestand.type, grootte: bestand.size },
      aanvraag: aanvraag.data,
    }).catch(() => null);
    if (!toelating || !toelating.ok) {
      setFase({ soort: "nakijken" });
      return setFout(toelating ? toelating.melding : "Geen verbinding met de app. Probeer opnieuw.");
    }

    try {
      await zetOp(toelating.data.uploadUrl, bestand, toelating.data.contentType, (voortgang) =>
        setFase({ soort: "bezig", tekst: "Opladen…", voortgang }),
      );
    } catch (oorzaak) {
      setFase({ soort: "nakijken" });
      return setFout(oorzaak instanceof Error ? oorzaak.message : "Opladen mislukt.");
    }

    setFase({ soort: "bezig", tekst: "Nakijken en inlezen…" });
    const uitkomst = await leesDossierInActie({ bestandId: toelating.data.bestandId, aanvraag: aanvraag.data }).catch(
      () => null,
    );
    if (!uitkomst || !uitkomst.ok) {
      setFase({ soort: "nakijken" });
      return setFout(uitkomst ? uitkomst.melding : "Geen verbinding met de app. Probeer opnieuw.");
    }

    // De PDF staat al in de browser: de viewer hoeft hem niet nog eens op te halen.
    await bewaarPdfBytes(toelating.data.bestandId, bytes);
    const { plannen, nieuwePlannen, verdiepingen: nieuweVerdiepingen, gebouwen } = uitkomst.data;
    const delen = [
      `${plannen} ${plannen === 1 ? "blad" : "bladen"} ingelezen`,
      nieuwePlannen > 0 ? `${nieuwePlannen} ${nieuwePlannen === 1 ? "nieuw plan" : "nieuwe plannen"}` : null,
      nieuweVerdiepingen > 0 ? `${nieuweVerdiepingen} ${nieuweVerdiepingen === 1 ? "nieuwe verdieping" : "nieuwe verdiepingen"}` : null,
      gebouwen > 0 ? `${gebouwen} ${gebouwen === 1 ? "nieuw gebouw" : "nieuwe gebouwen"}` : null,
    ].filter(Boolean);
    opnieuw();
    router.push(`/bouw/plannen?soort=goed&melding=${encodeURIComponent(`${delen.join(", ")}.`)}`);
    router.refresh();
  }

  if (fase.soort === "kiezen" || fase.soort === "lezen") {
    return (
      <div className="kaart">
        <label htmlFor="dossier">PDF met alle bladen</label>
        <input
          id="dossier"
          type="file"
          accept="application/pdf,.pdf"
          disabled={bezig}
          onChange={(gebeurtenis) => {
            const gekozen = gebeurtenis.currentTarget.files?.[0];
            if (gekozen) void lees(gekozen);
          }}
        />
        <p className="hulp">
          De app leest eerst in de browser wat op elk blad staat, en stelt per blad een plan voor. Pas als jullie
          dat nagekeken hebben, gaat de PDF naar onze privé-opslag.
        </p>
        {fase.soort === "lezen" ? (
          <div className="melding info" role="status">
            {fase.tekst}
          </div>
        ) : null}
        {fout ? <div className="melding fout">{fout}</div> : null}
      </div>
    );
  }

  const bestaandeVerdieping = (gebouw: string, naam: string) =>
    bestaand.verdiepingen.some((v) => verdiepingsleutel(v.gebouw, v.naam) === verdiepingsleutel(gebouw, naam));
  const gebouwnamen = [...new Set([...bestaand.gebouwen, ...rijen.map((rij) => rij.gebouw ?? "").filter(Boolean)])];
  const verdiepingnamen = [...new Set([...bestaand.verdiepingen.map((v) => v.naam), ...rijen.map((r) => r.verdieping ?? "").filter(Boolean)])];

  return (
    <div className="kaart dossier">
      <p className="hulp" style={{ marginTop: 0 }}>
        {bestand?.name} · {rijen.length} {rijen.length === 1 ? "blad" : "bladen"}. Kijk na wat de app voorstelt en
        pas aan wat niet klopt.
      </p>

      <datalist id="dossier-gebouwen">
        {gebouwnamen.map((naam) => (
          <option key={naam} value={naam} />
        ))}
      </datalist>
      <datalist id="dossier-verdiepingen">
        {verdiepingnamen.map((naam) => (
          <option key={naam} value={naam} />
        ))}
      </datalist>

      <div className="tabel-omhulsel">
        <table>
          <thead>
            <tr>
              <th aria-label="Meenemen" />
              <th className="getal">Blad</th>
              <th>Titel</th>
              <th>Soort</th>
              <th>Gebouw</th>
              <th>Verdieping</th>
              <th>Wordt</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((rij) => {
              const plan = koppeling.bladen.find((b) => b.pagina === rij.pagina)?.plan ?? null;
              return (
                <tr key={rij.pagina} className={rij.mee ? undefined : "uit"}>
                  <td data-label="Meenemen">
                    <input
                      type="checkbox"
                      checked={rij.mee}
                      disabled={bezig}
                      onChange={(g) => wijzig(rij.pagina, { mee: g.currentTarget.checked })}
                      aria-label={`Blad ${rij.pagina} meenemen`}
                    />
                  </td>
                  <td data-label="Blad" className="getal">
                    {rij.pagina}
                  </td>
                  <td data-label="Titel">
                    <input
                      value={rij.titel}
                      maxLength={120}
                      disabled={bezig || !rij.mee}
                      onChange={(g) => wijzig(rij.pagina, { titel: g.currentTarget.value })}
                      aria-label={`Titel van blad ${rij.pagina}`}
                    />
                    {rij.bladcode ? <div className="hulp">{rij.bladcode}</div> : null}
                  </td>
                  <td data-label="Soort">
                    <select
                      value={rij.soort}
                      disabled={bezig || !rij.mee}
                      onChange={(g) => {
                        const soort = g.currentTarget.value;
                        if (isSoortPlan(soort)) wijzig(rij.pagina, { soort });
                      }}
                      aria-label={`Soort van blad ${rij.pagina}`}
                    >
                      {SOORTEN_PLAN.map((soort) => (
                        <option key={soort} value={soort}>
                          {PLANNAMEN[soort]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Gebouw">
                    <input
                      value={rij.gebouw ?? ""}
                      list="dossier-gebouwen"
                      placeholder="hele project"
                      maxLength={60}
                      disabled={bezig || !rij.mee}
                      onChange={(g) => wijzig(rij.pagina, { gebouw: g.currentTarget.value || null })}
                      aria-label={`Gebouw van blad ${rij.pagina}`}
                    />
                  </td>
                  <td data-label="Verdieping">
                    {hoortBijVerdieping(rij.soort) ? (
                      <input
                        value={rij.verdieping ?? ""}
                        list="dossier-verdiepingen"
                        maxLength={60}
                        disabled={bezig || !rij.mee}
                        onChange={(g) => wijzig(rij.pagina, { verdieping: g.currentTarget.value || null })}
                        aria-label={`Verdieping van blad ${rij.pagina}`}
                      />
                    ) : (
                      <span className="hulp">—</span>
                    )}
                  </td>
                  <td data-label="Wordt">{!rij.mee ? "overgeslagen" : plan ? `nieuwe versie van ${plan.titel}` : "nieuw plan"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {verdiepingen.length > 0 ? (
        <>
          <h3>Verdiepingen</h3>
          <p className="hulp">
            Uit de grondplannen: het vloerpeil uit NIVO, de plafondhoogte uit PH, en de verdiepingshoogte tot het
            peil erboven. Van een verdieping die er al is, vult de app enkel aan wat nog leeg is.
          </p>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Gebouw</th>
                  <th>Verdieping</th>
                  <th>Vloerpeil (m)</th>
                  <th>Plafondhoogte (m)</th>
                  <th>Verdiepingshoogte (m)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {verdiepingen.map((verdieping) => {
                  const k = verdiepingsleutel(verdieping.gebouw, verdieping.naam);
                  const eigen = hoogtes[k] ?? {};
                  const veld = (naam: keyof Hoogtes, standaard: number | null, wat: string) => (
                    <input
                      inputMode="decimal"
                      value={eigen[naam] ?? komma(standaard)}
                      disabled={bezig}
                      onChange={(g) => {
                        const waarde = g.currentTarget.value;
                        setHoogtes((huidig) => ({ ...huidig, [k]: { ...huidig[k], [naam]: waarde } }));
                      }}
                      aria-label={`${wat} van ${verdieping.gebouw} ${verdieping.naam}`}
                    />
                  );
                  return (
                    <tr key={k}>
                      <td data-label="Gebouw">{verdieping.gebouw}</td>
                      <td data-label="Verdieping">{verdieping.naam}</td>
                      <td data-label="Vloerpeil (m)">{veld("vloerpeil", verdieping.vloerpeil, "Vloerpeil")}</td>
                      <td data-label="Plafondhoogte (m)">{veld("plafondhoogte", verdieping.plafondhoogte, "Plafondhoogte")}</td>
                      <td data-label="Verdiepingshoogte (m)">
                        {veld("verdiepingshoogte", verdieping.verdiepingshoogte, "Verdiepingshoogte")}
                      </td>
                      <td data-label="Stand">{bestaandeVerdieping(verdieping.gebouw, verdieping.naam) ? "bestaat al" : "nieuw"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="veldenrij" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="dossier-label">Label van de versie</label>
          <input
            id="dossier-label"
            value={label}
            maxLength={40}
            disabled={bezig}
            onChange={(g) => setLabel(g.currentTarget.value)}
          />
        </div>
        <div>
          <label htmlFor="dossier-datum">Datum van de plannen</label>
          <input
            id="dossier-datum"
            type="date"
            value={datum}
            disabled={bezig}
            onChange={(g) => setDatum(g.currentTarget.value)}
          />
        </div>
      </div>

      {koppeling.fouten.length > 0 ? (
        <div className="melding fout">
          {koppeling.fouten.map((tekst) => (
            <p key={tekst}>{tekst}</p>
          ))}
        </div>
      ) : null}
      {fout ? <div className="melding fout">{fout}</div> : null}
      {fase.soort === "bezig" ? (
        <div className="melding info" role="status">
          {fase.tekst}
          {fase.voortgang !== undefined ? (
            <progress className="voortgang" max={1} value={fase.voortgang}>
              {Math.round(fase.voortgang * 100)} %
            </progress>
          ) : null}
        </div>
      ) : null}

      <div className="knoppenrij">
        <button type="button" onClick={() => void inlezen()} disabled={bezig || bladen.length === 0 || koppeling.fouten.length > 0}>
          {bezig ? "Even geduld…" : `${bladen.length} ${bladen.length === 1 ? "blad" : "bladen"} inlezen`}
        </button>
        <button type="button" className="stil" onClick={opnieuw} disabled={bezig}>
          Ander bestand
        </button>
      </div>
    </div>
  );
}
