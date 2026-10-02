"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  basisSchaal,
  passendBeeld,
  zichtbaarStuk,
  zoomRond,
  type Beeld,
  type Grenzen,
  type Maat,
} from "@/lib/bouw/beeld";
import { haalPdfBytes, openPdf, pdfFout } from "@/lib/bouw/pdf";

import { vraagPlanUrl } from "../acties";
import { useGebaren } from "./gebaren";

/** Zoom in CSS-pixels per PDF-punt. Een A1 past op een laptop rond 0,4. */
const GRENZEN: Grenzen = { min: 0.05, max: 16 };

/** Het detailbeeld mag niet groter worden dan dit, voor een iPad of iPhone. */
const MAX_DETAIL_PIXELS = 6_000_000;

function isAfgebroken(fout: unknown): boolean {
  return fout instanceof Error && fout.name === "RenderingCancelledException";
}

/**
 * De planviewer. Het blad ligt als één laag op het scherm, met daarin:
 *
 * - het basisbeeld: één keer gerenderd, zo scherp als een iPad toelaat;
 * - het detailbeeld: na elke beweging opnieuw gerenderd, enkel voor wat in
 *   beeld is en op de echte resolutie, zodra het basisbeeld niet meer scherp
 *   genoeg is.
 *
 * Beide liggen in paginacoördinaten in die laag, dus bij het verschuiven en
 * zoomen bewegen ze mee zonder opnieuw te renderen.
 */
export default function Viewer({ versieId, bestandId, pagina }: { versieId: number; bestandId: number; pagina: number }) {
  const vakRef = useRef<HTMLDivElement>(null);
  const basisRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLCanvasElement>(null);
  const beeldRef = useRef<Beeld | null>(null);

  const [blad, setBlad] = useState<{ pagina: PDFPageProxy; maat: Maat; aantal: number } | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [beeld, setBeeldState] = useState<Beeld | null>(null);
  const [vak, setVak] = useState<Maat>({ breedte: 0, hoogte: 0 });
  const [basisscherpte, setBasisscherpte] = useState(0);

  const zetBeeld = useCallback((nieuw: Beeld) => {
    beeldRef.current = nieuw;
    setBeeldState(nieuw);
  }, []);

  useGebaren(vakRef, beeldRef, zetBeeld, GRENZEN);

  // Het plan ophalen (uit de cache van de browser als het kan) en het blad openen.
  useEffect(() => {
    let weg = false;
    let laden: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const bytes = await haalPdfBytes(bestandId, async () => {
          const antwoord = await vraagPlanUrl(versieId);
          if (!antwoord.ok) throw new Error(antwoord.melding);
          return antwoord.data.url;
        });
        if (weg) return;
        laden = openPdf(bytes);
        const pdf = await laden.promise;
        if (weg) return;
        if (pagina > pdf.numPages) {
          setFout(
            `Deze PDF heeft ${pdf.numPages === 1 ? "maar 1 blad" : `${pdf.numPages} bladen`}; blad ${pagina} bestaat niet.`,
          );
          return;
        }
        const pdfPagina = await pdf.getPage(pagina);
        if (weg) return;
        const viewport = pdfPagina.getViewport({ scale: 1 });
        setBlad({ pagina: pdfPagina, maat: { breedte: viewport.width, hoogte: viewport.height }, aantal: pdf.numPages });
      } catch (oorzaak) {
        if (!weg) setFout(pdfFout(oorzaak));
      }
    })();
    return () => {
      weg = true;
      void laden?.destroy();
    };
  }, [versieId, bestandId, pagina]);

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

  // De eerste keer: het hele blad in beeld.
  useEffect(() => {
    if (blad && vak.breedte > 0 && !beeldRef.current) zetBeeld(passendBeeld(vak, blad.maat));
  }, [blad, vak, zetBeeld]);

  // Het basisbeeld, één keer per blad.
  useEffect(() => {
    const canvas = basisRef.current;
    if (!blad || !canvas) return;
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
    if (!blad || !beeld || !zichtbaar || basisscherpte === 0) return;
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
    <div
      className="viewer"
      ref={vakRef}
      role="region"
      aria-label="Plan: sleep om te verschuiven, zoom met twee vingers of het muiswiel"
    >
      {blad ? (
        // Het blad staat er al voor het eerste beeld berekend is, zodat het
        // basisbeeld meteen kan renderen; tot dan is het onzichtbaar.
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
        </div>
      ) : (
        <div className="viewer-leeg">Plan laden…</div>
      )}
      {blad && beeld ? (
        <div className="viewer-balk">
          <button type="button" className="stil" onClick={() => zoomKnop(1 / 1.5)} aria-label="Uitzoomen">
            −
          </button>
          <button type="button" className="stil" onClick={() => zoomKnop(1.5)} aria-label="Inzoomen">
            +
          </button>
          <button type="button" className="stil" onClick={() => zetBeeld(passendBeeld(vak, blad.maat))}>
            Passend
          </button>
        </div>
      ) : null}
      {blad && blad.aantal > 1 ? (
        <div className="viewer-info">
          blad {pagina} van {blad.aantal}
        </div>
      ) : null}
    </div>
  );
}
