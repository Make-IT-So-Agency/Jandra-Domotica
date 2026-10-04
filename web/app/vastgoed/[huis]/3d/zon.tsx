"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import type { Kader2d } from "@/lib/bouw/drie/plaatsing";
import {
  brusselseTijd,
  daglicht,
  inBrussel,
  NOORDUITLEG,
  schaduwvak,
  uurtekst,
  VASTE_ZON,
  windrichting,
  zonnestand,
  zonOpEnOnder,
  zonRichting,
  type Noorden,
} from "@/lib/bouw/drie/zon";

import type { Kern } from "./kern";

/**
 * De zon op datum en uur, en de noordpijl. Het rekenwerk staat in
 * lib/bouw/drie/zon.ts; hier het licht in de scène en de kaart Zon.
 */

export interface Zonkern extends Kern {
  zon: THREE.DirectionalLight;
  hemel: THREE.HemisphereLight;
  rond: THREE.AmbientLight;
}

/** Het licht zoals het altijd was. */
const VOL = { zon: 2.6, hemel: 1.5, rond: 0.45 };
const KLEUREN = {
  zon: new THREE.Color("#fff4e0"),
  laag: new THREE.Color("#ffb070"),
  lucht: new THREE.Color("#cfe3f2"),
  nacht: new THREE.Color("#2f3b52"),
};
/** Hoe lang een dag duurt met Afspelen, in milliseconden. */
const AFSPEELDUUR = 30000;

export function Zonkaart({
  kern,
  klaar,
  noorden,
  terrein,
  metOmgeving,
}: {
  kern: RefObject<Zonkern | null>;
  /** Staat de scène er? */
  klaar: boolean;
  noorden: Noorden;
  terrein: Kader2d & { z1: number };
  /** Ligt de omgeving rond het huis: dan valt de schaduw ook over de tuin en de buren. */
  metOmgeving: boolean;
}) {
  const [aan, setAan] = useState(false);
  const [datum, setDatum] = useState(() => inBrussel(Date.now()).datum);
  const [minuten, setMinuten] = useState(() => inBrussel(Date.now()).minuten);
  const [afspelen, setAfspelen] = useState(false);

  const dag = useMemo(() => zonOpEnOnder(datum, noorden.geo), [datum, noorden.geo]);
  const van = dag ? Math.floor(dag.op / 10) * 10 : 0;
  const tot = dag ? Math.ceil(dag.onder / 10) * 10 : 1430;
  const stand = useMemo(() => zonnestand(brusselseTijd(datum, minuten), noorden.geo), [datum, minuten, noorden.geo]);

  // Het licht in de scène: de vaste zon, of de zon op datum en uur.
  useEffect(() => {
    const d = kern.current;
    if (!klaar || !d) return;
    // Enkel bij de zon op datum en uur over de buren: een groter vak maakt de schaduw van het huis zelf vager.
    const vak = schaduwvak(terrein, aan && metOmgeving);
    const richting = aan ? zonRichting(stand, noorden.hoek) : VASTE_ZON;
    const licht = aan ? daglicht(stand.hoogte) : { zon: 1, hemel: 1, laag: 0 };
    const midden = new THREE.Vector3(vak.midden[0], terrein.z1 / 2, vak.midden[1]);
    const afstand = vak.straal * 2 + 20;
    d.zon.target.position.copy(midden);
    d.zon.position.set(midden.x + richting[0] * afstand, midden.y + richting[1] * afstand, midden.z + richting[2] * afstand);
    const schaduw = d.zon.shadow.camera;
    schaduw.left = schaduw.bottom = -vak.straal;
    schaduw.right = schaduw.top = vak.straal;
    schaduw.near = 0.5;
    schaduw.far = afstand + vak.straal * 2 + 20;
    schaduw.updateProjectionMatrix();
    d.zon.intensity = VOL.zon * licht.zon;
    d.zon.color.copy(KLEUREN.zon).lerp(KLEUREN.laag, licht.laag);
    d.hemel.intensity = VOL.hemel * licht.hemel;
    d.rond.intensity = VOL.rond * licht.hemel;
    if (d.scene.background instanceof THREE.Color) d.scene.background.copy(KLEUREN.nacht).lerp(KLEUREN.lucht, (licht.hemel - 0.35) / 0.65);
  }, [kern, klaar, aan, stand, noorden.hoek, terrein, metOmgeving]);

  // Afspelen: de dag van zonsopgang tot zonsondergang in een halve minuut.
  const minutenRef = useRef(minuten);
  minutenRef.current = minuten;
  useEffect(() => {
    if (!afspelen || !dag) return;
    const snelheid = (dag.onder - dag.op) / AFSPEELDUUR;
    let huidig = minutenRef.current;
    let vorige = performance.now();
    let frame = 0;
    const lus = (nu: number) => {
      huidig = Math.min(dag.onder, huidig + snelheid * (nu - vorige));
      vorige = nu;
      setMinuten(huidig);
      if (huidig >= dag.onder) setAfspelen(false);
      else frame = requestAnimationFrame(lus);
    };
    frame = requestAnimationFrame(lus);
    return () => cancelAnimationFrame(frame);
  }, [afspelen, dag]);

  const jaar = datum.slice(0, 4);
  const kiesDatum = (nieuw: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nieuw)) return;
    setDatum(nieuw);
    setAfspelen(false);
    // Het uur blijft tussen zonsopgang en zonsondergang van de nieuwe dag.
    const nieuweDag = zonOpEnOnder(nieuw, noorden.geo);
    if (nieuweDag) setMinuten((huidig) => Math.min(nieuweDag.onder, Math.max(nieuweDag.op, huidig)));
  };
  const speel = () => {
    if (afspelen) {
      setAfspelen(false);
      return;
    }
    if (dag && (minuten >= dag.onder - 1 || minuten < dag.op)) setMinuten(dag.op);
    setAfspelen(true);
  };
  const nu = () => {
    const { datum: vandaag, minuten: uur } = inBrussel(Date.now());
    setDatum(vandaag);
    setMinuten(uur);
    setAfspelen(false);
  };

  const zin = dag
    ? `Zon op om ${uurtekst(dag.op)}, onder om ${uurtekst(dag.onder)}. ` +
      (stand.hoogte > 0
        ? `Om ${uurtekst(minuten)} staat ze ${Math.round(stand.hoogte)}° hoog in ${windrichting(stand.azimut)}.`
        : `Om ${uurtekst(minuten)} is ze onder.`)
    : `Om ${uurtekst(minuten)} staat de zon ${Math.round(stand.hoogte)}° hoog.`;

  return (
    <section className="kaart">
      <h3>Zon</h3>
      <label className="keuzevak">
        <input
          type="checkbox"
          checked={aan}
          onChange={(g) => {
            setAan(g.currentTarget.checked);
            setAfspelen(false);
          }}
        />
        Zon op datum en uur
      </label>
      {aan ? (
        <>
          <div className="veldenrij" style={{ marginTop: 8, marginBottom: 6 }}>
            <div>
              <label htmlFor="zon-datum">Datum</label>
              <input id="zon-datum" type="date" value={datum} onChange={(g) => kiesDatum(g.currentTarget.value)} />
            </div>
          </div>
          <div className="knoppenrij">
            <button type="button" className="stil" onClick={() => kiesDatum(`${jaar}-03-21`)}>
              21 maart
            </button>
            <button type="button" className="stil" onClick={() => kiesDatum(`${jaar}-06-21`)}>
              21 juni
            </button>
            <button type="button" className="stil" onClick={() => kiesDatum(`${jaar}-12-21`)}>
              21 december
            </button>
            <button type="button" className="stil" onClick={nu}>
              Nu
            </button>
          </div>
          <label htmlFor="zon-uur" style={{ marginTop: 10 }}>
            Uur: {uurtekst(minuten)}
          </label>
          <input
            id="zon-uur"
            type="range"
            min={van}
            max={tot}
            step={10}
            value={Math.min(tot, Math.max(van, Math.round(minuten / 10) * 10))}
            onChange={(g) => {
              setAfspelen(false);
              setMinuten(Number(g.currentTarget.value));
            }}
          />
          <div className="knoppenrij">
            <button type="button" className="stil" aria-pressed={afspelen} disabled={!dag} onClick={speel}>
              {afspelen ? "Stoppen" : "Afspelen"}
            </button>
          </div>
          <p className="hulp">{zin}</p>
        </>
      ) : (
        <p className="hulp">Nu staat de zon vast, schuin van linksboven. Met het vinkje zie je de schaduw op een dag en uur naar keuze.</p>
      )}
      <p className="hulp">{NOORDUITLEG[noorden.bron]}</p>
    </section>
  );
}

/**
 * Een kleine noordpijl op het beeld, die meedraait met de camera. Ze wijst
 * naar het ware noorden op het terrein (zie noordenOpTerrein).
 */
export function Noordpijl({ kern, klaar, noorden, tonen }: { kern: RefObject<Kern | null>; klaar: boolean; noorden: Noorden; tonen: boolean }) {
  const pijl = useRef<HTMLDivElement>(null);
  const hoek = useRef(noorden.hoek);
  hoek.current = noorden.hoek;

  useEffect(() => {
    const d = kern.current;
    if (!klaar || !d) return;
    const voor = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    // Van een punt voor de camera een meter naar het noorden: die richting op het scherm.
    const draai = () => {
      const element = pijl.current;
      if (!element) return;
      d.camera.getWorldDirection(voor);
      a.copy(d.camera.position).addScaledVector(voor, 10);
      const h = (hoek.current * Math.PI) / 180;
      b.set(a.x + Math.sin(h), a.y, a.z - Math.cos(h));
      a.project(d.camera);
      b.project(d.camera);
      const [dx, dy] = [(b.x - a.x) * d.camera.aspect, b.y - a.y];
      if (Math.hypot(dx, dy) < 1e-9) return;
      element.style.transform = `rotate(${(Math.atan2(dx, dy) * 180) / Math.PI}deg)`;
    };
    d.elkBeeld.add(draai);
    return () => {
      d.elkBeeld.delete(draai);
    };
  }, [kern, klaar]);

  if (!tonen) return null;
  const uitleg = NOORDUITLEG[noorden.bron];
  return (
    <div className={`drie-noorden${noorden.bron === "bewaard" || noorden.bron === "omgeving" ? "" : " aangenomen"}`} title={uitleg} role="img" aria-label={`Noordpijl. ${uitleg}`}>
      <div ref={pijl} className="pijl">
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <circle cx="28" cy="28" r="17" />
          <path className="noord" d="M28 13 L33 28 L23 28 Z" />
          <path className="zuid" d="M28 43 L33 28 L23 28 Z" />
          <text x="28" y="5.5">
            N
          </text>
        </svg>
      </div>
    </div>
  );
}
