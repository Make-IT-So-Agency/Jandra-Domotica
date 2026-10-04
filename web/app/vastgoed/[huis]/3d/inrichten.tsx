"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

import { tegenMuur } from "@/lib/bouw/drie/inrichten";
import { isAan, type Lagenstand } from "@/lib/bouw/drie/lagen";
import type { Model3d, Verdieping3d } from "@/lib/bouw/drie/model";
import { binnenVeelhoeken } from "@/lib/bouw/drie/vlak";
import {
  GROEPEN,
  GROEPKLEUREN,
  GROEPNAMEN,
  hoekVan,
  maattekst,
  MAX_MAAT,
  nieuwStuk,
  schoonLabel,
  soortStuk,
  STUKSOORTEN,
  type GeplaatstStuk,
  type Stuk,
} from "@/lib/bouw/inrichting";
import type { Xy } from "@/lib/bouw/omzetting/types";

import { bewaarStukkenActie } from "./acties";
import { richtStraal, TIKAFSTAND, useTik, zichtbareRaak, type Kern } from "./kern";
import type { Opgebouwd } from "./scene";
import { bouwStukken, type Stukkenscene } from "./stukken-scene";

/**
 * Inrichten: meubels en toestellen plaatsen, verschuiven, draaien en
 * bewaren, in 3D. Kies een verdieping en een stuk, en tik op de vloer; tik
 * een stuk om het te slepen of aan te passen. Bewaren gebeurt per verdieping
 * in één keer (bewaarStukkenActie). Enkel voor de browser; het rekenwerk
 * staat in lib/bouw/inrichting.ts en lib/bouw/drie/inrichten.ts.
 */

type Driekern = Kern & { controls: OrbitControls; opgebouwd: Opgebouwd | null };
type Melding = { soort: "goed" | "fout"; tekst: string };

/** Zo ver mag een hangend toestel na het slepen van de muur staan om er weer tegen te gaan. */
const MUURBEREIK = 1;

export interface Inrichting {
  /** De stukken zoals ze nu staan, ook wat nog niet bewaard is. */
  stukken: readonly GeplaatstStuk[];
  /** Op welke verdieping je inricht. */
  verdieping: Verdieping3d | null;
  kiesVerdieping(id: number): void;
  /** Tijdens het inrichten: de hoogte waarop alles erboven weg is, zodat je in de ruimtes kijkt. */
  snede: number | null;
  /** De soort die je wil zetten; een tik op de vloer zet hem daar. */
  nieuw: string | null;
  kiesNieuw(soort: string | null): void;
  gekozen: GeplaatstStuk | null;
  kies(id: number | null): void;
  wijzig(wijziging: Partial<Stuk>): void;
  draai(graden: number): void;
  tegenDeMuur(): void;
  verwijder(): void;
  /** De verdiepingen met wijzigingen die nog niet bewaard zijn. */
  veranderd: number[];
  bezig: boolean;
  bewaar(): Promise<void>;
  herbegin(): void;
  /** Esc: eerst wat je wilde zetten weg, dan het gekozen stuk los; false als er niets was. */
  breekAf(): boolean;
}

/** Het gelijkvloers van een gebouw: de laagste verdieping die geen kelder is. */
function gelijkvloersVan(model: Model3d, gebouwId: number): Verdieping3d | null {
  const eigen = model.verdiepingen.filter((v) => v.gebouwId === gebouwId).sort((a, b) => a.z0 - b.z0);
  return eigen.find((v) => v.z0 >= -0.5) ?? eigen.at(-1) ?? null;
}

const zonderVerdieping = (stukken: readonly GeplaatstStuk[], verdiepingId: number) =>
  JSON.stringify(
    stukken
      .filter((s) => s.verdiepingId === verdiepingId)
      .map(({ verdiepingId: _, ...stuk }) => stuk)
      .sort((a, b) => a.id - b.id),
  );

export function useInrichten(
  kern: RefObject<Driekern | null>,
  opties: {
    aan: boolean;
    huisId: number;
    model: Model3d;
    bewaard: readonly GeplaatstStuk[];
    lagen: Lagenstand;
    /** Waar de grond ligt in de scène. */
    grond: number;
    meld: (melding: Melding) => void;
  },
): Inrichting {
  const { aan, huisId, model, lagen, grond } = opties;
  const [bewaard, setBewaard] = useState<readonly GeplaatstStuk[]>(opties.bewaard);
  const [stukken, setStukken] = useState<readonly GeplaatstStuk[]>(opties.bewaard);
  const [verdiepingId, setVerdiepingId] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState<string | null>(null);
  const [gekozenId, setGekozenId] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const volgend = useRef(-1);
  const scene = useRef<Stukkenscene | null>(null);

  const verdieping =
    model.verdiepingen.find((v) => v.id === verdiepingId) ??
    (model.gebouwen[0] ? gelijkvloersVan(model, model.gebouwen[0].id) : null) ??
    model.verdiepingen[0] ??
    null;
  const gekozen = stukken.find((s) => s.id === gekozenId) ?? null;

  // De lus en de handlers lezen de laatste stand.
  const stand = useRef({ stukken, verdieping, nieuw, gekozen, model, grond, meld: opties.meld });
  stand.current = { stukken, verdieping, nieuw, gekozen, model, grond, meld: opties.meld };

  const murenVan = (id: number) => stand.current.model.verdiepingen.find((v) => v.id === id)?.muren.map((m) => m.veelhoek) ?? [];

  /** Een stuk anders; een hangend toestel blijft tegen de muur. */
  function vervang(id: number, wijzig: (stuk: GeplaatstStuk) => GeplaatstStuk) {
    setStukken((alle) => alle.map((s) => (s.id === id ? wijzig(s) : s)));
  }

  function verzet(id: number, [x, y]: Xy) {
    const stuk = stand.current.stukken.find((s) => s.id === id);
    if (!stuk) return;
    let verzet: GeplaatstStuk = { ...stuk, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    if (soortStuk(stuk.soort)?.plaats === "muur" && stuk.z > 0.05) verzet = tegenMuur(verzet, murenVan(stuk.verdiepingId), MUURBEREIK) ?? verzet;
    vervang(id, () => verzet);
  }
  const verzetRef = useRef(verzet);
  verzetRef.current = verzet;

  /** Een nieuw stuk waar getikt werd, op de vloer van de verdieping of op de grond. */
  function zet(soortnaam: string, e: PointerEvent) {
    const d = kern.current;
    const { verdieping: hier, model: m, grond: grondpeil, meld } = stand.current;
    const soort = soortStuk(soortnaam);
    if (!d?.opgebouwd || !hier || !soort) return;
    const buiten = soort.plaats === "buiten" || soort.plaats === "grond";
    const op = buiten ? gelijkvloersVan(m, hier.gebouwId) : hier;
    const groep = op ? d.opgebouwd.verdiepingen.get(op.id) : undefined;
    if (!op || !groep) return;
    const straal = new THREE.Raycaster();
    richtStraal(straal, e, d.renderer.domElement, d.camera);
    const hoogte = buiten ? grondpeil : op.z0 + 0.012;
    const punt = straal.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -hoogte), new THREE.Vector3());
    if (!punt) return meld({ soort: "fout", tekst: buiten ? "Tik op de grond." : "Tik op de vloer." });
    // Staat er iets tussen, zoals een muur, dan bedoel je die plek niet.
    const ervoor = zichtbareRaak(straal, [d.opgebouwd.wortel], d.snede)[0];
    if (ervoor && ervoor.distance < straal.ray.origin.distanceTo(punt) - 0.05) {
      return meld({ soort: "fout", tekst: buiten ? "Tik op de grond naast het huis." : "Tik op de vloer, niet op een muur." });
    }
    const lokaal = groep.worldToLocal(punt.clone());
    const plek: Xy = [lokaal.x, lokaal.z];
    if (!buiten && !binnenVeelhoeken(plek, [...op.plaat.veelhoeken, ...op.vloeren.map((v) => v.ringen)])) {
      return meld({ soort: "fout", tekst: "Tik op de vloer, binnen. Buiten komen enkel de stukken bij Buiten." });
    }
    let stuk: GeplaatstStuk = { ...nieuwStuk(soort, plek, volgend.current--, grondpeil - op.z0), verdiepingId: op.id };
    if (soort.plaats === "muur") stuk = tegenMuur(stuk, op.muren.map((muur) => muur.veelhoek), Math.max(stuk.breedte, stuk.diepte) / 2 + 0.6) ?? stuk;
    setStukken((alle) => [...alle, stuk]);
    setGekozenId(stuk.id);
    setNieuw(null);
  }
  const zetRef = useRef(zet);
  zetRef.current = zet;

  // Klaar met inrichten: niets meer gekozen.
  useEffect(() => {
    if (aan) return;
    setNieuw(null);
    setGekozenId(null);
  }, [aan]);

  // De stukken in de scène, in de groep van hun verdieping; opnieuw na elke wijziging of een nieuw model.
  useEffect(() => {
    const d = kern.current;
    if (!d?.opgebouwd) return;
    const nieuweScene = bouwStukken(stukken, model, d.opgebouwd.verdiepingen, d.snede);
    scene.current = nieuweScene;
    return () => {
      nieuweScene.opruimen();
      if (scene.current === nieuweScene) scene.current = null;
    };
  }, [kern, model, stukken]);

  // De lagen; tijdens het inrichten zie je alles.
  useEffect(() => {
    for (const groep of scene.current?.objecten.values() ?? []) groep.visible = aan || isAan(lagen, `inrichting:${groep.userData.laag}`);
  }, [model, stukken, lagen, aan]);

  // Het gekozen stuk: een oranje kader, en zijn naam erboven.
  useEffect(() => {
    const groep = gekozenId !== null ? scene.current?.objecten.get(gekozenId) : undefined;
    const stuk = stukken.find((s) => s.id === gekozenId);
    if (!aan || !groep || !stuk) return;
    const kader = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(stuk.breedte + 0.02, stuk.hoogte + 0.02, stuk.diepte + 0.02)),
      new THREE.LineBasicMaterial({ color: "#ea580c", depthTest: false, transparent: true }),
    );
    kader.position.y = stuk.hoogte / 2;
    kader.renderOrder = 10;
    const element = document.createElement("div");
    element.className = "drie-puntlabel";
    element.textContent = `${soortStuk(stuk.soort)?.naam ?? stuk.soort}${stuk.label ? ` · ${stuk.label}` : ""}`;
    const label = new CSS2DObject(element);
    label.position.set(0, stuk.hoogte, 0);
    label.center.set(0.5, 1.4);
    groep.add(kader, label);
    return () => {
      groep.remove(kader, label);
      kader.geometry.dispose();
      (kader.material as THREE.Material).dispose();
    };
  }, [aan, gekozenId, stukken, model]);

  // Een stuk aantikken en slepen. Elders slepen draait de camera zoals altijd.
  useEffect(() => {
    const d = kern.current;
    if (!aan || !d) return;
    const doel = d.renderer.domElement;
    const straal = new THREE.Raycaster();
    let sleep: {
      id: number;
      pointer: number;
      object: THREE.Object3D;
      vlak: THREE.Plane;
      verschil: THREE.Vector3;
      begin: { x: number; y: number };
      naar: Xy | null;
    } | null = null;
    const druk = (e: PointerEvent) => {
      if (e.button !== 0 || !scene.current) return;
      richtStraal(straal, e, doel, d.camera);
      let object: THREE.Object3D | null = zichtbareRaak(straal, [...scene.current.objecten.values()], d.snede)[0]?.object ?? null;
      while (object && object.userData.stukId === undefined) object = object.parent;
      const id = object?.userData.stukId as number | undefined;
      if (!object || id === undefined) return;
      // Dit is voor het stuk, niet voor de camera.
      e.stopImmediatePropagation();
      setGekozenId(id);
      setNieuw(null);
      const plek = object.getWorldPosition(new THREE.Vector3());
      const vlak = new THREE.Plane(new THREE.Vector3(0, 1, 0), -plek.y);
      const raak = straal.ray.intersectPlane(vlak, new THREE.Vector3());
      if (!raak) return;
      d.controls.enabled = false;
      doel.setPointerCapture(e.pointerId);
      sleep = { id, pointer: e.pointerId, object, vlak, verschil: plek.sub(raak), begin: { x: e.clientX, y: e.clientY }, naar: null };
    };
    const beweeg = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      if (!sleep.naar && Math.hypot(e.clientX - sleep.begin.x, e.clientY - sleep.begin.y) <= TIKAFSTAND) return;
      richtStraal(straal, e, doel, d.camera);
      const raak = straal.ray.intersectPlane(sleep.vlak, new THREE.Vector3());
      const ouder = sleep.object.parent;
      if (!raak || !ouder) return;
      const lokaal = ouder.worldToLocal(raak.add(sleep.verschil));
      // Tijdens het slepen enkel de groep; de rest pas bij het loslaten.
      sleep.object.position.x = lokaal.x;
      sleep.object.position.z = lokaal.z;
      sleep.naar = [lokaal.x, lokaal.z];
    };
    const los = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      const { id, naar } = sleep;
      sleep = null;
      d.controls.enabled = true;
      if (naar) verzetRef.current(id, naar);
    };
    doel.addEventListener("pointerdown", druk, { capture: true });
    doel.addEventListener("pointermove", beweeg);
    doel.addEventListener("pointerup", los);
    doel.addEventListener("pointercancel", los);
    return () => {
      doel.removeEventListener("pointerdown", druk, { capture: true });
      doel.removeEventListener("pointermove", beweeg);
      doel.removeEventListener("pointerup", los);
      doel.removeEventListener("pointercancel", los);
      d.controls.enabled = true;
    };
  }, [aan, kern]);

  // Een tik naast de stukken: zetten wat gekozen is, of het gekozen stuk loslaten.
  useTik(kern, aan, (e) => {
    const soort = stand.current.nieuw;
    if (soort) zetRef.current(soort, e);
    else setGekozenId(null);
  });

  // Het gekozen stuk met de toetsen: de pijltjes verschuiven 5 cm (Shift 50 cm), R draait 15°, Delete haalt het weg.
  useEffect(() => {
    if (!aan || gekozenId === null) return;
    const toets = (e: KeyboardEvent) => {
      const veld = (e.target as HTMLElement | null)?.tagName;
      if (veld === "INPUT" || veld === "SELECT" || veld === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const d = kern.current;
      const groep = scene.current?.objecten.get(gekozenId);
      const stuk = stand.current.stukken.find((s) => s.id === gekozenId);
      if (!d || !groep?.parent || !stuk) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setStukken((alle) => alle.filter((s) => s.id !== gekozenId));
        setGekozenId(null);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        vervang(gekozenId, (s) => ({ ...s, hoek: hoekVan(s.hoek + (e.shiftKey ? -15 : 15)) }));
        return;
      }
      const stap = e.shiftKey ? 0.5 : 0.05;
      const richting: Record<string, [number, number]> = { ArrowUp: [stap, 0], ArrowDown: [-stap, 0], ArrowLeft: [0, -stap], ArrowRight: [0, stap] };
      const [vooruit, opzij] = richting[e.key] ?? [0, 0];
      if (!vooruit && !opzij) return;
      e.preventDefault();
      // Vooruit is van de camera weg, op de grond; dan naar het assenstelsel van het gebouw.
      const kijk = new THREE.Vector3();
      d.camera.getWorldDirection(kijk);
      kijk.y = 0;
      if (kijk.lengthSq() < 1e-6) kijk.set(0, 0, -1);
      kijk.normalize();
      const hier = groep.getWorldPosition(new THREE.Vector3());
      const daar = hier.clone().add(new THREE.Vector3(kijk.x * vooruit - kijk.z * opzij, 0, kijk.z * vooruit + kijk.x * opzij));
      const [a, b] = [groep.parent.worldToLocal(hier), groep.parent.worldToLocal(daar)];
      verzetRef.current(gekozenId, [stuk.x + b.x - a.x, stuk.y + b.z - a.z]);
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [aan, gekozenId, kern]);

  const veranderd = useMemo(() => {
    const verdiepingen = new Set([...bewaard, ...stukken].map((s) => s.verdiepingId));
    return [...verdiepingen].filter((id) => zonderVerdieping(stukken, id) !== zonderVerdieping(bewaard, id));
  }, [bewaard, stukken]);

  // Wie weggaat met wijzigingen die niet bewaard zijn, krijgt een vraag van de browser.
  useEffect(() => {
    if (veranderd.length === 0) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [veranderd.length]);

  async function bewaar() {
    setBezig(true);
    try {
      for (const id of veranderd) {
        const lijst = stukken.filter((s) => s.verdiepingId === id).map(({ verdiepingId: _, ...stuk }) => stuk);
        const uitkomst = await bewaarStukkenActie(huisId, { verdiepingId: id, stukken: lijst }).catch(() => null);
        if (!uitkomst?.ok) {
          opties.meld({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
          return;
        }
        // De nieuwe stukken hebben nu een id uit de databank.
        const vervang = (alle: readonly GeplaatstStuk[]) => [...alle.filter((s) => s.verdiepingId !== id), ...uitkomst.data];
        setBewaard(vervang);
        setStukken(vervang);
      }
      setGekozenId(null);
      opties.meld({ soort: "goed", tekst: "Meubels en toestellen bewaard." });
    } finally {
      setBezig(false);
    }
  }

  return {
    stukken,
    verdieping,
    kiesVerdieping(id) {
      setVerdiepingId(id);
      setGekozenId(null);
    },
    snede: aan && verdieping ? verdieping.z0 + verdieping.plafond - 0.02 : null,
    nieuw,
    kiesNieuw(soort) {
      setNieuw(soort);
      if (soort) setGekozenId(null);
    },
    gekozen,
    kies: setGekozenId,
    wijzig(wijziging) {
      if (gekozen) vervang(gekozen.id, (s) => ({ ...s, ...wijziging }));
    },
    draai(graden) {
      if (gekozen) vervang(gekozen.id, (s) => ({ ...s, hoek: hoekVan(s.hoek + graden) }));
    },
    tegenDeMuur() {
      if (!gekozen) return;
      const tegen = tegenMuur(gekozen, murenVan(gekozen.verdiepingId));
      if (tegen) vervang(gekozen.id, () => tegen);
      else opties.meld({ soort: "fout", tekst: "Geen muur in de buurt: zet het stuk eerst dichter bij een muur." });
    },
    verwijder() {
      if (!gekozen) return;
      setStukken((alle) => alle.filter((s) => s.id !== gekozen.id));
      setGekozenId(null);
    },
    veranderd,
    bezig,
    bewaar,
    herbegin() {
      setStukken(bewaard);
      setGekozenId(null);
      setNieuw(null);
    },
    breekAf() {
      if (!aan) return false;
      if (nieuw) {
        setNieuw(null);
        return true;
      }
      if (gekozenId !== null) {
        setGekozenId(null);
        return true;
      }
      return false;
    },
  };
}

/** Een maat in centimeter; wat je intikt, telt pas na Enter of als je het veld verlaat. */
function Maatveld({ id, label, meter, min, max, zet }: { id: string; label: string; meter: number; min: number; max: number; zet: (meter: number) => void }) {
  const [tekst, setTekst] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={tekst ?? String(Math.round(meter * 100))}
        onChange={(g) => setTekst(g.currentTarget.value)}
        onBlur={(g) => {
          const cm = Number(g.currentTarget.value.replace(",", ".").trim());
          setTekst(null);
          if (g.currentTarget.value.trim() !== "" && Number.isFinite(cm) && cm >= min * 100 && cm <= max * 100) zet(Math.round(cm) / 100);
        }}
        onKeyDown={(g) => {
          if (g.key === "Enter") g.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** Het gekozen stuk: draaien, de maten, een label, tegen de muur, weg. */
function Stukkaart({ inrichting, stuk }: { inrichting: Inrichting; stuk: GeplaatstStuk }) {
  const [hoektekst, setHoektekst] = useState<string | null>(null);
  const [labeltekst, setLabeltekst] = useState<string | null>(null);
  const soort = soortStuk(stuk.soort);
  const draaiknop = (graden: number, tekst: string, uitleg: string) => (
    <button type="button" className="stil" title={uitleg} onClick={() => inrichting.draai(graden)}>
      {tekst}
    </button>
  );
  return (
    <div className="verplaatsen">
      <p>
        <strong>{soort?.naam ?? stuk.soort}</strong> <span className="hulp">· {maattekst(stuk)}</span>
      </p>
      <div className="draaiknoppen" role="group" aria-label="Draaien">
        {draaiknop(-90, "⟲ 90°", "Een kwartslag tegen de klok in")}
        {draaiknop(-15, "⟲ 15°", "15° tegen de klok in (Shift+R)")}
        <input
          aria-label="Hoek in graden, met de klok mee"
          inputMode="decimal"
          value={hoektekst ?? String(stuk.hoek).replace(".", ",")}
          onChange={(g) => setHoektekst(g.currentTarget.value)}
          onBlur={(g) => {
            const hoek = Number(g.currentTarget.value.replace(",", "."));
            setHoektekst(null);
            if (g.currentTarget.value.trim() !== "" && Number.isFinite(hoek)) inrichting.wijzig({ hoek: hoekVan(hoek) });
          }}
          onKeyDown={(g) => {
            if (g.key === "Enter") g.currentTarget.blur();
          }}
        />
        {draaiknop(15, "⟳ 15°", "15° met de klok mee (R)")}
        {draaiknop(90, "⟳ 90°", "Een kwartslag met de klok mee")}
      </div>
      <div className="veldenrij" style={{ marginTop: 8 }}>
        <Maatveld key={`b${stuk.id}`} id="stuk-breedte" label="Breedte (cm)" meter={stuk.breedte} min={0.05} max={MAX_MAAT} zet={(breedte) => inrichting.wijzig({ breedte })} />
        <Maatveld key={`d${stuk.id}`} id="stuk-diepte" label="Diepte (cm)" meter={stuk.diepte} min={0.05} max={MAX_MAAT} zet={(diepte) => inrichting.wijzig({ diepte })} />
        <Maatveld key={`h${stuk.id}`} id="stuk-hoogte" label="Hoogte (cm)" meter={stuk.hoogte} min={0.02} max={MAX_MAAT} zet={(hoogte) => inrichting.wijzig({ hoogte })} />
        <Maatveld
          key={`z${stuk.id}`}
          id="stuk-z"
          label={soort?.plaats === "grond" ? "Onderkant (cm)" : "Boven de vloer (cm)"}
          meter={stuk.z}
          min={-10}
          max={10}
          zet={(z) => inrichting.wijzig({ z })}
        />
      </div>
      <label htmlFor="stuk-label" style={{ marginTop: 8 }}>
        Label
      </label>
      <input
        key={`l${stuk.id}`}
        id="stuk-label"
        maxLength={80}
        placeholder="bv. Kast in de berging"
        value={labeltekst ?? stuk.label ?? ""}
        onChange={(g) => setLabeltekst(g.currentTarget.value)}
        onBlur={(g) => {
          setLabeltekst(null);
          inrichting.wijzig({ label: schoonLabel(g.currentTarget.value) });
        }}
        onKeyDown={(g) => {
          if (g.key === "Enter") g.currentTarget.blur();
        }}
      />
      <div className="knoppenrij">
        <button type="button" className="stil" onClick={inrichting.tegenDeMuur}>
          Tegen de muur
        </button>
        <button type="button" className="stil" onClick={inrichting.verwijder}>
          Weg
        </button>
        <button type="button" className="stil" onClick={() => inrichting.kies(null)}>
          Klaar
        </button>
      </div>
    </div>
  );
}

/** De kaart Inrichten in het paneel. */
export function Inrichtkaart({
  inrichting,
  aan,
  wissel,
  verdiepingen,
}: {
  inrichting: Inrichting;
  aan: boolean;
  wissel: () => void;
  verdiepingen: readonly { id: number; naam: string }[];
}) {
  const aantal = inrichting.stukken.length;
  return (
    <section className="kaart">
      <h3>
        Inrichten {aantal > 0 ? <span className="hulp">· {aantal} {aantal === 1 ? "stuk" : "stukken"}</span> : null}
      </h3>
      {!aan ? (
        <>
          <p className="hulp">
            Meubels en toestellen in het huis: een bed, de keuken, een warmtepomp. Ze staan op de lagen Meubels en Toestellen, en
            houden je tegen bij het rondwandelen.
          </p>
          <div className="knoppenrij">
            <button type="button" className="stil" onClick={wissel}>
              Inrichten
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="inrichten-op">Op</label>
          <select id="inrichten-op" value={inrichting.verdieping?.id ?? ""} onChange={(g) => inrichting.kiesVerdieping(Number(g.currentTarget.value))}>
            {verdiepingen.map((v) => (
              <option key={v.id} value={v.id}>
                {v.naam}
              </option>
            ))}
          </select>
          {inrichting.gekozen ? <Stukkaart key={inrichting.gekozen.id} inrichting={inrichting} stuk={inrichting.gekozen} /> : null}
          <p className="hulp" style={{ marginTop: 10 }}>
            {inrichting.nieuw
              ? `Tik waar het midden van ${soortStuk(inrichting.nieuw)?.naam.toLowerCase() ?? "het stuk"} moet komen.`
              : "Kies een stuk en tik op de vloer."}
          </p>
          {GROEPEN.map((groep) => (
            <details key={groep} className="palet">
              <summary className="palet-kop">{GROEPNAMEN[groep]}</summary>
              <div className="palet-knoppen">
                {STUKSOORTEN.filter((s) => s.groep === groep).map((s) => (
                  <button
                    key={s.soort}
                    type="button"
                    className={`stil palet-knop${inrichting.nieuw === s.soort ? " gekozen" : ""}`}
                    title={`${s.naam}, ${maattekst({ breedte: s.maat[0], diepte: s.maat[1], hoogte: s.maat[2] })}`}
                    onClick={() => inrichting.kiesNieuw(inrichting.nieuw === s.soort ? null : s.soort)}
                  >
                    <span className="stukstaal" style={{ background: GROEPKLEUREN[groep] }} />
                    {s.naam}
                  </button>
                ))}
              </div>
            </details>
          ))}
          <div className="knoppenrij">
            <button type="button" className="stil" onClick={wissel}>
              Klaar met inrichten
            </button>
          </div>
        </>
      )}
      {inrichting.veranderd.length > 0 ? (
        <div className="knoppenrij">
          <button type="button" disabled={inrichting.bezig} onClick={() => void inrichting.bewaar()}>
            Meubels bewaren
          </button>
          <button type="button" className="stil" disabled={inrichting.bezig} onClick={inrichting.herbegin}>
            Herbeginnen
          </button>
        </div>
      ) : null}
    </section>
  );
}
