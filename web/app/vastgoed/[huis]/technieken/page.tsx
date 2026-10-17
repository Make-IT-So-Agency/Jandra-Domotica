import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { Melding } from "@/components/bouw/melding";
import { Tekeningsvg } from "@/components/bouw/tekening";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { huispad } from "@/lib/bouw/paden";
import { laadTechnieken } from "@/lib/bouw/technieken/laden";
import { eendraadschema, situatieschema } from "@/lib/bouw/technieken/schema";
import {
  aansluitingTekst,
  aansluitingen,
  beveiligingTekst,
  differentieelTekst,
  domoticaTekst,
  meters,
  netwerkTekst,
  plaatsTekst,
  ruimtesTekst,
  tellingTekst,
} from "@/lib/bouw/technieken/weergave";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { bewaarTechniekenActie } from "./acties";

export const dynamic = "force-dynamic";

export default async function Techniekenpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;
  const huis = await vereistHuis(params);
  const { melding, soort } = await searchParams;
  const { invoer, instellingen, bewaard, voorstel } = await laadTechnieken(huis);
  const { kringen, differentielen, verdeelkast, domotica, netwerk } = voorstel;
  const verdiepingen = invoer.verdiepingen;
  const kabel = voorstel.kabels.reduce((som, k) => som + k.lengte, 0);

  return (
    <>
      <h1>Technieken</h1>
      <p className="inleiding">
        Een voorstel voor de elektriciteit, uit de punten op het plan en de toestellen in 3D: de kringen, de verdeelkast, de domoticakast,
        de netwerkkast en het eendraadschema. Om met de elektricien te bespreken: hij tekent het definitieve schema, en een erkend organisme
        keurt de installatie. Wat je bij <Link href={huispad(huis.id, "/punten")}>Punten</Link> verandert, staat hier meteen.
      </p>

      <Melding soort={soort} melding={melding} />

      {invoer.punten.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen punten. Zet ze op het plan bij <Link href={huispad(huis.id, "/punten")}>Punten</Link>: daaruit volgt het voorstel.
          </p>
        </div>
      ) : (
        <>
          <div className="knoppenrij" style={{ marginBottom: 18 }}>
            <a className="knop" href={`/api/bouw/technieken/pdf?huis=${huis.id}`}>
              PDF downloaden
            </a>
            <Link className="knop stil" href={huispad(huis.id, "/punten/wensenlijst")}>
              Wensenlijst
            </Link>
          </div>

          <section className="kaart">
            <h2 style={{ marginTop: 0 }}>Uitgangspunten</h2>
            <form action={bewaarTechniekenActie.bind(null, huis.id)} className="technieken-instellingen">
              <div>
                <label htmlFor="aansluiting">Aansluiting</label>
                <select id="aansluiting" name="aansluiting" defaultValue={`${instellingen.fasen}x${instellingen.stroom}`}>
                  {aansluitingen().map((a) => (
                    <option key={a.waarde} value={a.waarde}>
                      {a.naam}
                    </option>
                  ))}
                </select>
              </div>
              <label className="keuzevak">
                <input type="checkbox" name="domotica" value="ja" defaultChecked={instellingen.domotica} />
                Domotica: drukknoppen, en elke lichtgroep en elk rolluik een eigen kabel naar de domoticakast
              </label>
              <div className="knoppenrij">
                <button type="submit">Bewaren</button>
              </div>
            </form>
            <p className="hulp">
              {bewaard
                ? "Zoals bewaard."
                : "De app koos dit zelf: drie fasen met een laadpaal of een warmtepomp, domotica als er drukknoppen op het plan staan. Bewaar om het vast te leggen."}
            </p>
          </section>

          <div className="tegels">
            <div className="tegel">
              <div className="label">Kringen</div>
              <div className="waarde">{kringen.length}</div>
              <div className="bij">
                {differentielen.length} differentiëlen · {aansluitingTekst(instellingen)}
              </div>
            </div>
            <div className="tegel">
              <div className="label">Verdeelkast</div>
              <div className="waarde">{verdeelkast.rijen} rijen</div>
              <div className="bij">
                {verdeelkast.modules} modules en {verdeelkast.reserve} vrij
              </div>
            </div>
            {domotica ? (
              <div className="tegel">
                <div className="label">Domotica</div>
                <div className="waarde">{domotica.relais + domotica.dimmers + domotica.led + domotica.motoren} uitgangen</div>
                <div className="bij">
                  {domotica.drukknoppen + domotica.melders} ingangen · {domotica.kast.rijen} rijen
                </div>
              </div>
            ) : null}
            <div className="tegel">
              <div className="label">Netwerk</div>
              <div className="waarde">{netwerk.totaal} poorten</div>
              <div className="bij">
                {netwerk.poe} met PoE · rack van {netwerk.hoogte} U
              </div>
            </div>
            <div className="tegel">
              <div className="label">Kabel</div>
              <div className="waarde">± {kabel} m</div>
              <div className="bij">geschat, met 10% speling</div>
            </div>
          </div>

          {voorstel.opmerkingen.length > 0 ? (
            <div className="melding let-op">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {voorstel.opmerkingen.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <h2>Waar de kasten komen</h2>
          <div className="kaart">
            <dl className="technieken-plaatsen">
              <dt>Verdeelkast</dt>
              <dd>{plaatsTekst(voorstel.kast, verdiepingen)}</dd>
              {domotica ? (
                <>
                  <dt>Domoticakast</dt>
                  <dd>{domotica.plaats?.bron === "domoticakast" ? plaatsTekst(domotica.plaats, verdiepingen) : "Naast de verdeelkast."}</dd>
                </>
              ) : null}
              <dt>Netwerkkast</dt>
              <dd>{netwerk.plaats?.bron === "netwerkkast" ? plaatsTekst(netwerk.plaats, verdiepingen) : "Naast de verdeelkast."}</dd>
            </dl>
            <p className="hulp">
              Zet de verdeelkast, de domoticakast of de netwerkkast bij Inrichten in <Link href={huispad(huis.id, "/3d")}>3D</Link> (bij
              Elektriciteit en energie): dan rekent het voorstel de kabels vanaf daar.
            </p>
          </div>

          <h2>Kringen</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Kring</th>
                  <th>Wat</th>
                  <th>Automaat</th>
                  <th>Kabel</th>
                  <th>Differentieel</th>
                  <th>Punten</th>
                  <th className="getal">Lengte</th>
                </tr>
              </thead>
              <tbody>
                {kringen.map((k) => (
                  <tr key={k.letter}>
                    <td data-label="Kring">
                      <strong>{k.letter}</strong>
                    </td>
                    <td data-label="Wat">
                      {k.naam}
                      {ruimtesTekst(k) ? <div className="hulp">{ruimtesTekst(k)}</div> : null}
                      {k.opmerking ? <div className="hulp">{k.opmerking}</div> : null}
                    </td>
                    <td data-label="Automaat">{beveiligingTekst(k.beveiliging)}</td>
                    <td data-label="Kabel">{k.kabel}</td>
                    <td data-label="Differentieel">{differentieelTekst(differentielen[k.differentieel], differentielen)}</td>
                    <td data-label="Punten">{tellingTekst(k)}</td>
                    <td data-label="Lengte" className="getal">
                      {meters(k.kabellengte)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hulp">
            Vuistregels uit het AREI: hoogstens 8 contactdozen per kring (een dubbele in één doos telt als één), 2,5 mm² op 20 A voor
            stopcontacten, 1,5 mm² op 16 A voor verlichting, een eigen kring voor elk groot toestel. Een badkamer met licht en stopcontacten
            samen: elk lichtpunt telt als een contactdoos, op 16 A. Spots in één ruimte gaan samen aan: ze tellen als één lichtpunt.
          </p>

          <h2>Verdeelkast</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Wat</th>
                  <th className="getal">Aantal</th>
                  <th className="getal">Modules</th>
                </tr>
              </thead>
              <tbody>
                {verdeelkast.regels.map((r) => (
                  <tr key={r.wat}>
                    <td data-label="Wat">{r.wat}</td>
                    <td data-label="Aantal" className="getal">
                      {r.aantal}
                    </td>
                    <td data-label="Modules" className="getal">
                      {r.aantal * r.breedte}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="Samen">
                    Samen, met {verdeelkast.reserve} modules vrij voor later: een kast van {verdeelkast.rijen} rijen van 13 modules
                  </td>
                  <td />
                  <td data-label="Modules" className="getal">
                    {verdeelkast.modules + verdeelkast.reserve}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h2>Eendraadschema</h2>
          <div className="tekening-omhulsel">
            <Tekeningsvg tekening={eendraadschema(voorstel)} titel="Eendraadschema" />
          </div>
          <p className="hulp">
            Elke kring hangt aan haar automaat, en de kringen achter een differentieel van 30 mA aan hun eigen bus. De punten staan langs de
            kabel, in de volgorde waarin ze doorgelust worden; hun nummer staat ook op het situatieschema.
          </p>

          <h2>Situatieschema</h2>
          {verdiepingen.map((v) => {
            const tekening = situatieschema(voorstel, v);
            return tekening ? (
              <section key={v.id} className="kaart">
                <h3 style={{ marginTop: 0 }}>{v.naam}</h3>
                <div className="tekening-omhulsel">
                  <Tekeningsvg tekening={tekening} titel={`Situatieschema ${v.naam}`} />
                </div>
              </section>
            ) : null;
          })}

          {domotica ? (
            <>
              <h2>Domoticakast</h2>
              <p>{domoticaTekst(domotica)}.</p>
              <p className="hulp">
                Uitgangen en ingangen, los van het merk: elke lichtgroep een relais of een dimmer (met een dimmer in de ruimte), spots samen
                één, elk rolluik een motoruitgang, elke drukknop en melder een ingang. De modules zijn een ruwe schatting; elk systeem heeft
                zijn eigen.
              </p>
              <div className="tabel-omhulsel">
                <table>
                  <thead>
                    <tr>
                      <th>Ruimte</th>
                      <th className="getal">Relais</th>
                      <th className="getal">Dimmers</th>
                      <th className="getal">Led</th>
                      <th className="getal">Motoren</th>
                      <th className="getal">Drukknoppen</th>
                      <th className="getal">Melders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domotica.perRuimte.map((r) => (
                      <tr key={`${r.verdieping}:${r.ruimte}`}>
                        <td data-label="Ruimte">
                          {r.ruimte}
                          <div className="hulp">{r.verdieping}</div>
                        </td>
                        <td data-label="Relais" className="getal">
                          {r.relais || ""}
                        </td>
                        <td data-label="Dimmers" className="getal">
                          {r.dimmers || ""}
                        </td>
                        <td data-label="Led" className="getal">
                          {r.led || ""}
                        </td>
                        <td data-label="Motoren" className="getal">
                          {r.motoren || ""}
                        </td>
                        <td data-label="Drukknoppen" className="getal">
                          {r.drukknoppen || ""}
                        </td>
                        <td data-label="Melders" className="getal">
                          {r.melders || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label="Totaal">Totaal</td>
                      <td data-label="Relais" className="getal">
                        {domotica.relais}
                      </td>
                      <td data-label="Dimmers" className="getal">
                        {domotica.dimmers}
                      </td>
                      <td data-label="Led" className="getal">
                        {domotica.led}
                      </td>
                      <td data-label="Motoren" className="getal">
                        {domotica.motoren}
                      </td>
                      <td data-label="Drukknoppen" className="getal">
                        {domotica.drukknoppen}
                      </td>
                      <td data-label="Melders" className="getal">
                        {domotica.melders}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="tabel-omhulsel">
                <table>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th className="getal">Aantal</th>
                      <th className="getal">Modules</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domotica.kast.regels.map((r) => (
                      <tr key={r.wat}>
                        <td data-label="Module">{r.wat}</td>
                        <td data-label="Aantal" className="getal">
                          {r.aantal}
                        </td>
                        <td data-label="Modules" className="getal">
                          {r.aantal * r.breedte}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label="Samen">
                        Samen, met {domotica.kast.reserve} vrij: {domotica.kast.rijen} rijen van 13 modules
                      </td>
                      <td />
                      <td data-label="Modules" className="getal">
                        {domotica.kast.modules + domotica.kast.reserve}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="hulp">
                Kabels naar de kast:{" "}
                {domotica.kabels.map((k) => `${k.aantal} × ${k.soort} (${meters(k.lengte)})`).join(", ")}. Bij een bus (KNX, Loxone Tree)
                lussen de drukknoppen en melders door op één buskabel.
              </p>
            </>
          ) : null}

          <h2>Netwerkkast</h2>
          {netwerk.totaal === 0 ? (
            <div className="kaart">
              <p className="leeg">Nog geen netwerkpunten, wifi of camera&apos;s op het plan.</p>
            </div>
          ) : (
            <>
              <div className="tabel-omhulsel">
                <table>
                  <thead>
                    <tr>
                      <th>Wat</th>
                      <th className="getal">Poorten</th>
                      <th>PoE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {netwerk.poorten.map((p) => (
                      <tr key={p.wat}>
                        <td data-label="Wat">{p.wat}</td>
                        <td data-label="Poorten" className="getal">
                          {p.aantal}
                        </td>
                        <td data-label="PoE">{p.poe ? "ja" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label="Totaal">Totaal</td>
                      <td data-label="Poorten" className="getal">
                        {netwerk.totaal}
                      </td>
                      <td data-label="PoE">{netwerk.poe} met PoE</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="hulp">{netwerkTekst(netwerk)}</p>
            </>
          )}

          <h2>Kabels</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Kabel</th>
                  <th className="getal">Lengte</th>
                </tr>
              </thead>
              <tbody>
                {voorstel.kabels.map((k) => (
                  <tr key={k.soort}>
                    <td data-label="Kabel">{k.soort}</td>
                    <td data-label="Lengte" className="getal">
                      ± {k.lengte} m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hulp">
            Geschat: van de kast langs de muren naar elk punt (waterpas en haaks), de hoogte tussen de verdiepingen, telkens 1,5 m in de muur
            omhoog of omlaag, en 10% speling. Een kabel naar een ander gebouw telt niet mee.
          </p>
        </>
      )}
    </>
  );
}
