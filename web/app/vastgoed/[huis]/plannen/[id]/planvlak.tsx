"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  basisSchaal,
  passendBeeld,
  passendStuk,
  schermNaarPagina,
  zichtbaarStuk,
  zoomRond,
  type Beeld,
  type Grenzen,
  type Maat,
  type Punt,
} from "@/lib/bouw/beeld";
import { pdfFout } from "@/lib/bouw/pdf";

import { useGebaren } from "./gebaren";
import type { Geladenblad } from "./planblad";

/** Zoom in CSS-pixels per PDF-punt. Een A1 past op een laptop rond 0,4. */
const GRENZEN: Grenzen = { min: 0.05, max: 16 };

/** Het detailbeeld mag niet groter worden dan dit, voor een iPad of iPhone. */
const MAX_DETAIL_PIXELS = 6_000_000;

function isAfgebroken(fout: unknown): boolean {
  return fout instanceof Error && fout.name === "RenderingCancelledException";
}

export interface Stuk {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

/**
 * Een blad op het scherm, om te verschuiven en te zoomen. Het blad ligt als
 * één laag in het vak, met daarin:
 *
 * - het basisbeeld: één keer gerenderd, zo scherp als een iPad toelaat;
 * - het detailbeeld: na elke beweging opnieuw gerenderd, enkel voor wat in
 *   beeld is en op de echte resolutie, zodra het basisbeeld niet meer scherp
 *   genoeg is;
 * - een laag in paginapunten, bv. de ruimtes van een omzetting.
 *
 * Alles ligt in paginacoördinaten in die laag, dus bij het verschuiven en
 * zoomen beweegt het mee zonder opnieuw te renderen.
 */
export function Planvlak({
  blad,
  laag,
  opTik,
  balk,
  info,
  start,
  klasse,
  label = "Plan: sleep om te verschuiven, zoom met twee vingers of het muiswiel",
}: {
  blad: Geladenblad;
  /** Iets in paginapunten over het blad. Krijgt de zoom mee, om tekst en lijnen leesbaar te houden. */
  laag?: (zoom: number) => ReactNode;
  /** Een tik zonder te slepen, met het punt in paginapunten en de zoom van dat moment. */
  opTik?: (punt: Punt, zoom: number) => void;
  /** Extra knoppen naast inzoomen en uitzoomen. */
  balk?: ReactNode;
  info?: ReactNode;
  /** Wat bij het begin en bij "Passend" in beeld komt; anders het hele blad. */
  start?: Stuk | null;
  klasse?: string;
  label?: string;
}) {
  const vakRef = useRef<HTMLDivElement>(null);
  const basisRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const beeldRef = useRef<Beeld | null>(null);

  const [beeld, setBeeldState] = useState<Beeld | null>(null);
  const [vak, setVak] = useState<Maat>({ breedte: 0, hoogte: 0 });
  const [basisscherpte, setBasisscherpte] = useState(0);
  const [fout, setFout] = useState<string | null>(null);

  const zetBeeld = useCallback((nieuw: Beeld) => {
    beeldRef.current = nieuw;
    setBeeldState(nieuw);
  }, []);

  const tik = useCallback(
    (punt: Punt) => {
      const huidig = beeldRef.current;
      if (huidig && opTik) opTik(schermNaarPagina(huidig, punt), huidig.zoom);
    },
    [opTik],
  );
  useGebaren(vakRef, beeldRef, zetBeeld, GRENZEN, opTik ? tik : undefined);

  // De maat van het vak volgen, bv. bij het draaien van een tablet.
  useEffect(() => {
    const element = vakRef.current;
    if (!element) return;
    const waarnemer = new ResizeObserver(([meting]) =>
      setVak({ breedte: meting.contentRect.width, hoogte: meting.contentRect.height }),
    );
    waarnemer.observe(element);
    return () => waarnemer.disconnect();
  }, []);

  const passend = useCallback(
    () => (start ? passendStuk(vak, start) : passendBeeld(vak, blad.maat)),
    [start, vak, blad.maat],
  );

  // De eerste keer: het hele blad, of het gevraagde stuk, in beeld.
  useEffect(() => {
    if (vak.breedte > 0 && !beeldRef.current) zetBeeld(passend());
  }, [vak, passend, zetBeeld]);

  // Het basisbeeld, één keer per blad.
  useEffect(() => {
    const canvas = basisRef.current;
    if (!canvas) return;
    const schaal = basisSchaal(blad.maat, Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 1.5)));
    const viewport = blad.pagina.getViewport({ scale: schaal });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const taak = blad.pagina.render({ canvas, viewport });
    taak.promise.then(
      () => setBasisscherpte(schaal),
      (oorzaak) => {
        if (!isAfgebroken(oorzaak)) setFout(pdfFout(oorzaak));
      },
    );
    return () => taak.cancel();
  }, [blad]);

  // Het detailbeeld, even nadat het beeld stilstaat.
  useEffect(() => {
    const zichtbaar = detailRef.current;
    if (!beeld || !zichtbaar || basisscherpte === 0) return;
    const nodig = beeld.zoom * (window.devicePixelRatio || 1);
    if (nodig <= basisscherpte * 1.1) {
      zichtbaar.style.display = "none";
      return;
    }
    const stuk = zichtbaarStuk(beeld, vak, blad.maat);
    if (!stuk) return;

    let taak: RenderTask | null = null;
    const wacht = window.setTimeout(() => {
      const schaal = Math.min(nodig, Math.sqrt(MAX_DETAIL_PIXELS / (stuk.breedte * stuk.hoogte)));
      if (schaal <= basisscherpte * 1.1) return;
      // Eerst buiten beeld renderen: pdf.js begint met een wit vlak, en dat
      // zou anders even over het basisbeeld flitsen.
      const buiten = document.createElement("canvas");
      buiten.width = Math.max(1, Math.ceil(stuk.breedte * schaal));
      buiten.height = Math.max(1, Math.ceil(stuk.hoogte * schaal));
      taak = blad.pagina.render({
        canvas: buiten,
        viewport: blad.pagina.getViewport({ scale: schaal }),
        transform: [1, 0, 0, 1, -stuk.x * schaal, -stuk.y * schaal],
      });
      taak.promise.then(
        () => {
          zichtbaar.width = buiten.width;
          zichtbaar.height = buiten.height;
          zichtbaar.getContext("2d")?.drawImage(buiten, 0, 0);
          Object.assign(zichtbaar.style, {
            display: "block",
            left: `${stuk.x}px`,
            top: `${stuk.y}px`,
            width: `${buiten.width / schaal}px`,
            height: `${buiten.height / schaal}px`,
          });
          buiten.width = buiten.height = 0;
        },
        () => {
          buiten.width = buiten.height = 0;
        },
      );
    }, 200);
    return () => {
      window.clearTimeout(wacht);
      taak?.cancel();
    };
  }, [blad, beeld, vak, basisscherpte]);

  const zoomKnop = (factor: number) => {
    const huidig = beeldRef.current;
    if (huidig) zetBeeld(zoomRond(huidig, { x: vak.breedte / 2, y: vak.hoogte / 2 }, factor, GRENZEN));
  };

  if (fout) return <div className="viewer viewer-leeg melding fout">{fout}</div>;

  return (
    <div className={`viewer${klasse ? ` ${klasse}` : ""}`} ref={vakRef} role="region" aria-label={label}>
      {/* Het blad staat er al voor het eerste beeld berekend is, zodat het
          basisbeeld meteen kan renderen; tot dan is het onzichtbaar. */}
      <div
        className="viewer-blad"
        style={{
          width: blad.maat.breedte,
          height: blad.maat.hoogte,
          transform: beeld ? `translate(${beeld.x}px, ${beeld.y}px) scale(${beeld.zoom})` : undefined,
          visibility: beeld ? "visible" : "hidden",
        }}
      >
        <canvas ref={basisRef} style={{ width: blad.maat.breedte, height: blad.maat.hoogte }} />
        <canvas ref={detailRef} className="viewer-detail" />
        {laag && beeld ? (
          <svg
            className="viewer-laag"
            width={blad.maat.breedte}
            height={blad.maat.hoogte}
            viewBox={`0 0 ${blad.maat.breedte} ${blad.maat.hoogte}`}
          >
            {laag(beeld.zoom)}
          </svg>
        ) : null}
      </div>
      {beeld ? (
        <div className="viewer-balk">
          {balk}
          <button type="button" className="stil" onClick={() => zoomKnop(1 / 1.5)} aria-label="Uitzoomen">
            −
          </button>
          <button type="button" className="stil" onClick={() => zoomKnop(1.5)} aria-label="Inzoomen">
            +
          </button>
          <button type="button" className="stil" onClick={() => zetBeeld(passend())}>
            Passend
          </button>
        </div>
      ) : null}
      {info ? <div className="viewer-info">{info}</div> : null}
    </div>
  );
}
