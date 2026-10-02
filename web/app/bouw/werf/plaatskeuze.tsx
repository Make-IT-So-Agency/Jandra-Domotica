"use client";

import { useState, type MouseEvent } from "react";

import type { Xy } from "@/lib/bouw/omzetting/types";
import { ruimteVan } from "@/lib/bouw/punten";

export interface Plaats {
  id: number;
  naam: string;
  kader: { x0: number; y0: number; x1: number; y1: number } | null;
  ruimtes: { id: number; naam: string; veelhoek: Xy[][] }[];
}

const pad = (ringen: Xy[][]) => ringen.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join("L")}Z`).join("");

/**
 * Waar iets is: een verdieping, een ruimte, en eventueel een prik op de
 * tekening van de ruimtes. De tekening is in meter, zoals de ruimtes; tik
 * erop en de ruimte volgt vanzelf. Voor in een formulier: de keuze gaat mee
 * in verdieping_id, ruimte_id, x_m en y_m.
 */
export function Plaatskeuze({
  plaatsen,
  start,
  uitleg = "Tik op de tekening waar het is.",
  voorvoegsel = "plaats",
}: {
  plaatsen: Plaats[];
  start: { verdieping_id: number | null; ruimte_id: number | null; x_m: number | null; y_m: number | null };
  uitleg?: string;
  /** Voor de id's van de velden, als er twee op één pagina staan. */
  voorvoegsel?: string;
}) {
  const verdiepingVanRuimte = (ruimte: number | null) => plaatsen.find((p) => p.ruimtes.some((r) => r.id === ruimte))?.id ?? null;
  const [verdiepingId, setVerdiepingId] = useState<number | null>(
    start.verdieping_id ?? verdiepingVanRuimte(start.ruimte_id) ?? plaatsen.find((p) => p.kader)?.id ?? null,
  );
  const [ruimteId, setRuimteId] = useState<number | null>(start.ruimte_id);
  const [punt, setPunt] = useState<Xy | null>(start.x_m !== null && start.y_m !== null ? [start.x_m, start.y_m] : null);
  const verdieping = plaatsen.find((p) => p.id === verdiepingId) ?? null;

  function prik(gebeurtenis: MouseEvent<SVGSVGElement>) {
    if (!verdieping) return;
    const svg = gebeurtenis.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(gebeurtenis.clientX, gebeurtenis.clientY).matrixTransform(matrix.inverse());
    const nieuw: Xy = [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000];
    setPunt(nieuw);
    const ruimte = ruimteVan({ x_m: nieuw[0], y_m: nieuw[1] }, verdieping.ruimtes);
    if (ruimte !== null) setRuimteId(ruimte);
  }

  const marge = 0.6;
  const k = verdieping?.kader;
  return (
    <div className="plaatskeuze">
      <input type="hidden" name="verdieping_id" value={verdiepingId ?? ""} />
      <input type="hidden" name="x_m" value={punt ? String(punt[0]) : ""} />
      <input type="hidden" name="y_m" value={punt ? String(punt[1]) : ""} />
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-verdieping`}>Verdieping</label>
          <select
            id={`${voorvoegsel}-verdieping`}
            value={verdiepingId ?? ""}
            onChange={(g) => {
              const nieuw = g.currentTarget.value ? Number(g.currentTarget.value) : null;
              setVerdiepingId(nieuw);
              setPunt(null);
              if (verdiepingVanRuimte(ruimteId) !== nieuw) setRuimteId(null);
            }}
          >
            <option value="">—</option>
            {plaatsen.map((plaats) => (
              <option key={plaats.id} value={plaats.id}>
                {plaats.naam}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-ruimte`}>Ruimte</label>
          <select
            id={`${voorvoegsel}-ruimte`}
            name="ruimte_id"
            value={ruimteId ?? ""}
            onChange={(g) => setRuimteId(g.currentTarget.value ? Number(g.currentTarget.value) : null)}
          >
            <option value="">—</option>
            {(verdieping?.ruimtes ?? []).map((ruimte) => (
              <option key={ruimte.id} value={ruimte.id}>
                {ruimte.naam}
              </option>
            ))}
          </select>
        </div>
      </div>
      {verdieping && k ? (
        <>
          <svg
            className="prikplan"
            viewBox={`${k.x0 - marge} ${k.y0 - marge} ${k.x1 - k.x0 + 2 * marge} ${k.y1 - k.y0 + 2 * marge}`}
            onClick={prik}
            role="img"
            aria-label={`Tekening van ${verdieping.naam}: tik om te prikken`}
          >
            {verdieping.ruimtes.map((ruimte) => (
              <path key={ruimte.id} d={pad(ruimte.veelhoek)} fillRule="evenodd" className={ruimte.id === ruimteId ? "gekozen" : undefined}>
                <title>{ruimte.naam}</title>
              </path>
            ))}
            {punt ? (
              <g className="prik" transform={`translate(${punt[0]} ${punt[1]})`}>
                <circle r={0.32} className="prik-halo" />
                <circle r={0.14} />
              </g>
            ) : null}
          </svg>
          <p className="hulp">
            {uitleg}{" "}
            {punt ? (
              <button type="button" className="link" onClick={() => setPunt(null)}>
                Prik wissen
              </button>
            ) : null}
          </p>
        </>
      ) : verdieping ? (
        <p className="hulp">Deze verdieping heeft nog geen ruimtes: zet eerst haar grondplan om. Kies dan maar enkel de ruimte.</p>
      ) : null}
    </div>
  );
}
