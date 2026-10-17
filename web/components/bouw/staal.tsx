"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { venster } from "@/lib/bouw/drie/fotostaal";
import type { Materiaal } from "@/lib/bouw/drie/materialen";
import { BAKSTEEN, PATROONMATEN, TEGEL, tint, willekeur } from "@/lib/bouw/drie/stalen";
import type { Patroon } from "@/lib/bouw/keuzes";

/**
 * Een patroon tekenen: baksteen met voegen, pannen, leien, zink, planken,
 * parket, tegels, beton en crepi, op echte schaal (zie PATROONMATEN). 3D
 * maakt er een textuur van (3d/texturen.ts); een staal toont het klein, met
 * <Staalbeeld>. Enkel voor de browser.
 *
 * Elk patroon is één herhaling: wat rechts of onderaan uit het doek loopt,
 * komt links of bovenaan terug. Bovenaan het doek is boven op de muur en
 * hogerop het dak.
 *
 * Met een foto van een staal (zie lib/bouw/drie/fotostaal.ts) vult een stukje
 * van die foto elke steen, tegel, pan of plank, telkens elders en soms
 * gespiegeld; de voegen blijven getekend.
 */

/** Een foto die elke steen, tegel of plank vult: het beeld, en de uitsnede met het staal in pixels. */
export interface Fotogezicht {
  beeld: CanvasImageSource;
  uitsnede: [number, number, number, number];
  /** Voor het toeval: dezelfde foto geeft altijd dezelfde muur. */
  sleutel: string;
}

/** Een patroon met zijn kleuren, en eventueel een foto per stuk. */
export type Patroonmateriaal = Pick<Materiaal, "kleur" | "voegkleur"> & { patroon: Patroon; gezicht?: Fotogezicht };

/** De voeg als er geen kleur voor gekozen is. */
const STANDAARDVOEG = "#c9c2b8";

type Doek = CanvasRenderingContext2D;

type Tekenaar = (x: number, y: number, breedte: number, hoogte: number) => void;

/** Een rechthoek in meter, die rond de randen van het doek doorloopt: effen, of met wat `teken` erin zet. */
function rond(ctx: Doek, s: number, b: number, h: number, x: number, y: number, w: number, hh: number, teken?: Tekenaar) {
  for (const dx of [0, -b, b]) {
    for (const dy of [0, -h, h]) {
      const [x0, y0, x1, y1] = [(x + dx) * s, (y + dy) * s, (x + dx + w) * s, (y + dy + hh) * s];
      if (x1 <= 0 || y1 <= 0 || x0 >= b * s || y0 >= h * s) continue;
      if (teken) teken(x0, y0, x1 - x0, y1 - y0);
      else ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

/**
 * Hoe één stuk getekend wordt: effen in zijn kleur, of met een stukje van de
 * foto met de vorm van het stuk, wat lichter of donkerder. Eén keer gekozen
 * per stuk: ook als het rond de rand doorloopt, is het hetzelfde stukje.
 */
function stukVan(ctx: Doek, gezicht: Fotogezicht | undefined, toeval: () => number) {
  return (kleur: string, verhouding: number): Tekenaar => {
    if (!gezicht) {
      return (x, y, breedte, hoogte) => {
        ctx.fillStyle = kleur;
        ctx.fillRect(x, y, breedte, hoogte);
      };
    }
    const v = venster(gezicht.uitsnede, verhouding, toeval);
    const helder = 0.9 + toeval() * 0.2;
    return (x, y, breedte, hoogte) => {
      ctx.save();
      if (v.spiegel) {
        ctx.translate(x + breedte, y);
        ctx.scale(-1, 1);
        ctx.drawImage(gezicht.beeld, v.x, v.y, v.breedte, v.hoogte, 0, 0, breedte, hoogte);
      } else {
        ctx.drawImage(gezicht.beeld, v.x, v.y, v.breedte, v.hoogte, x, y, breedte, hoogte);
      }
      ctx.restore();
      ctx.fillStyle = helder > 1 ? `rgba(255,255,255,${(helder - 1).toFixed(3)})` : `rgba(0,0,0,${(1 - helder).toFixed(3)})`;
      ctx.fillRect(x, y, breedte, hoogte);
    };
  };
}

/** Korrels: lichte en donkere stipjes, zoals in crepi, beton of een steen. */
function korrels(ctx: Doek, toeval: () => number, breedte: number, hoogte: number, aantal: number, grootte: number, sterkte: number) {
  for (let i = 0; i < aantal; i++) {
    const licht = toeval() < 0.5;
    ctx.fillStyle = licht ? `rgba(255,255,255,${sterkte * toeval()})` : `rgba(0,0,0,${sterkte * toeval()})`;
    const r = Math.max(0.6, grootte * (0.4 + toeval()));
    ctx.fillRect(toeval() * breedte, toeval() * hoogte, r, r);
  }
}

/**
 * Een plank van x tot x + lengte, met nerven: dunne lijnen in de lengte. Een
 * plank die rechts uit het doek loopt, komt links terug, met dezelfde nerven.
 * Met een foto (`teken`): de foto, zonder getekende nerven.
 */
function plank(
  ctx: Doek,
  toeval: () => number,
  s: number,
  b: number,
  kleur: string,
  x: number,
  y: number,
  lengte: number,
  breedte: number,
  teken?: Tekenaar,
) {
  if (teken) {
    for (const dx of [0, -b, b]) {
      const [x0, x1] = [(x + dx) * s, (x + dx + lengte) * s];
      if (x1 > 0 && x0 < b * s) teken(x0, y * s, x1 - x0, breedte * s);
    }
    return;
  }
  const nerven = Array.from({ length: Math.max(3, Math.round(breedte * 60)) }, () => ({
    stijl: toeval() < 0.6 ? `rgba(60,35,15,${0.05 + 0.1 * toeval()})` : `rgba(255,240,220,${0.05 + 0.08 * toeval()})`,
    dikte: Math.max(0.5, s * 0.0015 * (0.5 + toeval())),
    waar: (y + breedte * toeval()) * s,
    golf: (toeval() - 0.5) * breedte * s * 0.2,
  }));
  for (const dx of [0, -b, b]) {
    const [x0, x1] = [(x + dx) * s, (x + dx + lengte) * s];
    if (x1 <= 0 || x0 >= b * s) continue;
    ctx.fillStyle = kleur;
    ctx.fillRect(x0, y * s, x1 - x0, breedte * s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y * s, x1 - x0, breedte * s);
    ctx.clip();
    for (const nerf of nerven) {
      ctx.strokeStyle = nerf.stijl;
      ctx.lineWidth = nerf.dikte;
      ctx.beginPath();
      ctx.moveTo(x0, nerf.waar);
      ctx.quadraticCurveTo((x0 + x1) / 2, nerf.waar + nerf.golf, x1, nerf.waar);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Tekent één herhaling van het patroon, met s pixels per meter. */
export function tekenPatroon(ctx: Doek, materiaal: Patroonmateriaal, s: number) {
  const { patroon, kleur } = materiaal;
  const maat = PATROONMATEN[patroon];
  const [b, h] = [maat.breedte, maat.hoogte];
  const [B, H] = [b * s, h * s];
  const toeval = willekeur(`${patroon}${kleur}${materiaal.voegkleur ?? ""}`);
  const variant = (sterkte: number) => tint(kleur, 1 + (toeval() - 0.5) * 2 * sterkte);
  const { gezicht } = materiaal;
  const stuk = stukVan(ctx, gezicht, willekeur(`${gezicht?.sleutel ?? ""}|${patroon}`));
  /** Korrels enkel zonder foto: een foto heeft haar eigen korrel. */
  const korrel = (...args: Parameters<typeof korrels>) => {
    if (!gezicht) korrels(...args);
  };

  switch (patroon) {
    case "baksteen": {
      const { lengte, hoogte, voeg } = BAKSTEEN;
      const [mb, mh] = [lengte + voeg, hoogte + voeg];
      ctx.fillStyle = materiaal.voegkleur ?? STANDAARDVOEG;
      ctx.fillRect(0, 0, B, H);
      for (let r = 0; r < maat.rijen; r++) {
        const verschuiving = (r % 2) * (mb / 2);
        for (let c = 0; c < maat.kolommen; c++) {
          const x = c * mb + verschuiving + voeg / 2;
          const y = r * mh + voeg / 2;
          rond(ctx, s, b, h, x, y, lengte, hoogte, stuk(variant(0.12), lengte / hoogte));
          // De onderkant van de steen werpt een schaduwtje in de voeg.
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          rond(ctx, s, b, h, x, y + hoogte, lengte, voeg * 0.35);
        }
      }
      korrel(ctx, toeval, B, H, Math.round(b * h * 9000), s * 0.0025, 0.16);
      break;
    }
    case "pannen": {
      const [pb, ph] = [b / maat.kolommen, h / maat.rijen];
      ctx.fillStyle = kleur;
      ctx.fillRect(0, 0, B, H);
      for (let r = 0; r < maat.rijen; r++) {
        for (let c = 0; c < maat.kolommen; c++) {
          const [x, y] = [c * pb * s, r * ph * s];
          stuk(variant(0.07), pb / ph)(x, y, pb * s, ph * s);
          // Het golfje van de pan: licht op de bolle kant, donker in de holte.
          const golf = ctx.createLinearGradient(x, 0, x + pb * s, 0);
          golf.addColorStop(0, "rgba(0,0,0,0.12)");
          golf.addColorStop(0.3, "rgba(255,255,255,0.14)");
          golf.addColorStop(0.7, "rgba(0,0,0,0.2)");
          golf.addColorStop(1, "rgba(0,0,0,0.1)");
          ctx.fillStyle = golf;
          ctx.fillRect(x, y, pb * s, ph * s);
          // Bovenaan valt de schaduw van de rij erboven, onderaan vangt de rand het licht.
          const schaduw = ctx.createLinearGradient(0, y, 0, y + ph * s * 0.18);
          schaduw.addColorStop(0, "rgba(0,0,0,0.45)");
          schaduw.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = schaduw;
          ctx.fillRect(x, y, pb * s, ph * s * 0.18);
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(x, y + ph * s - Math.max(1, s * 0.006), pb * s, Math.max(1, s * 0.006));
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(x + pb * s - Math.max(1, s * 0.003), y, Math.max(1, s * 0.003), ph * s);
        }
      }
      korrel(ctx, toeval, B, H, Math.round(b * h * 3000), s * 0.003, 0.08);
      break;
    }
    case "leien": {
      const [lb, lh] = [b / maat.kolommen, h / maat.rijen];
      const spleet = 0.004;
      ctx.fillStyle = tint(kleur, 0.5);
      ctx.fillRect(0, 0, B, H);
      for (let r = 0; r < maat.rijen; r++) {
        const verschuiving = (r % 2) * (lb / 2);
        for (let c = 0; c < maat.kolommen; c++) {
          rond(ctx, s, b, h, c * lb + verschuiving + spleet / 2, r * lh, lb - spleet, lh - spleet, stuk(variant(0.1), (lb - spleet) / (lh - spleet)));
        }
        const schaduw = ctx.createLinearGradient(0, r * lh * s, 0, (r * lh + lh * 0.15) * s);
        schaduw.addColorStop(0, "rgba(0,0,0,0.35)");
        schaduw.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = schaduw;
        ctx.fillRect(0, r * lh * s, B, lh * 0.15 * s);
      }
      korrel(ctx, toeval, B, H, Math.round(b * h * 4000), s * 0.002, 0.1);
      break;
    }
    case "zink": {
      ctx.fillStyle = kleur;
      ctx.fillRect(0, 0, B, H);
      // Strepen in de lengte, zoals gewalst metaal.
      for (let i = 0; i < B; i += Math.max(1, s * 0.004)) {
        ctx.fillStyle = toeval() < 0.5 ? `rgba(255,255,255,${0.05 * toeval()})` : `rgba(0,0,0,${0.06 * toeval()})`;
        ctx.fillRect(i, 0, Math.max(1, s * 0.004), H);
      }
      // De staande naad in het midden: een lichte rib met een schaduw ernaast.
      const midden = B / 2;
      ctx.fillStyle = tint(kleur, 1.3);
      ctx.fillRect(midden - s * 0.004, 0, s * 0.006, H);
      const schaduw = ctx.createLinearGradient(midden + s * 0.002, 0, midden + s * 0.025, 0);
      schaduw.addColorStop(0, "rgba(0,0,0,0.35)");
      schaduw.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = schaduw;
      ctx.fillRect(midden + s * 0.002, 0, s * 0.023, H);
      break;
    }
    case "planken":
    case "parket": {
      const rij = h / maat.rijen;
      const lengte = b / maat.kolommen;
      const spleet = patroon === "planken" ? 0.008 : 0.0015;
      ctx.fillStyle = tint(kleur, 0.45);
      ctx.fillRect(0, 0, B, H);
      for (let r = 0; r < maat.rijen; r++) {
        // Elke rij begint elders: de naden springen.
        const verschuiving = ((r * 0.37) % 1) * lengte;
        for (let c = 0; c < maat.kolommen; c++) {
          const kleurplank = variant(patroon === "parket" ? 0.12 : 0.08);
          const met = gezicht ? stuk(kleurplank, (lengte - spleet) / (rij - spleet)) : undefined;
          plank(ctx, toeval, s, b, kleurplank, c * lengte + verschuiving + spleet / 2, r * rij, lengte - spleet, rij - spleet, met);
        }
      }
      break;
    }
    case "tegels": {
      const { zijde, voeg } = TEGEL;
      ctx.fillStyle = materiaal.voegkleur ?? STANDAARDVOEG;
      ctx.fillRect(0, 0, B, H);
      for (let r = 0; r < maat.rijen; r++) {
        for (let c = 0; c < maat.kolommen; c++) {
          const v = Math.max(voeg * s, 1);
          stuk(variant(0.03), 1)(c * zijde * s + v / 2, r * zijde * s + v / 2, zijde * s - v, zijde * s - v);
        }
      }
      korrel(ctx, toeval, B, H, Math.round(b * h * 2500), s * 0.002, 0.06);
      break;
    }
    case "beton": {
      ctx.fillStyle = kleur;
      ctx.fillRect(0, 0, B, H);
      // Wolken: grote, zachte vlekken.
      for (let i = 0; i < 14; i++) {
        const [x, y, r] = [toeval() * B, toeval() * H, (0.2 + toeval() * 0.6) * s];
        const toon = toeval() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
        // Ook over de rand: zo loopt de vlek door in de volgende plaat.
        for (const dx of [0, -B, B]) {
          for (const dy of [0, -H, H]) {
            const vlek = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
            vlek.addColorStop(0, toon);
            vlek.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = vlek;
            ctx.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
          }
        }
      }
      korrels(ctx, toeval, B, H, Math.round(b * h * 6000), s * 0.002, 0.12);
      // De naden van de bekisting, en de gaten van de spanstaven.
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, B, Math.max(1, s * 0.002));
      ctx.fillRect(0, 0, Math.max(1, s * 0.002), H);
      for (const [x, y] of [
        [0.3, 0.3],
        [b - 0.3, 0.3],
        [0.3, h - 0.3],
        [b - 0.3, h - 0.3],
      ]) {
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(x * s, y * s, 0.012 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "crepi": {
      ctx.fillStyle = kleur;
      ctx.fillRect(0, 0, B, H);
      korrels(ctx, toeval, B, H, Math.round(b * h * 60000), s * 0.0018, 0.14);
      break;
    }
  }
}

/** Hoeveel pixels per meter een textuur in 3D krijgt: scherp, maar hoogstens zo'n 1,2 miljoen pixels. */
export function pixelsPerMeter(patroon: Patroon): number {
  const { breedte, hoogte } = PATROONMATEN[patroon];
  return Math.min(1200, 2048 / Math.max(breedte, hoogte), Math.sqrt(1_200_000 / (breedte * hoogte)));
}

/** Een doek met één herhaling van het patroon. */
export function patroonDoek(materiaal: Patroonmateriaal, s = pixelsPerMeter(materiaal.patroon)): HTMLCanvasElement {
  const maat = PATROONMATEN[materiaal.patroon];
  const doek = document.createElement("canvas");
  doek.width = Math.max(1, Math.round(maat.breedte * s));
  doek.height = Math.max(1, Math.round(maat.hoogte * s));
  const ctx = doek.getContext("2d");
  if (ctx) tekenPatroon(ctx, materiaal, doek.width / maat.breedte);
  return doek;
}

/** Hoe groot een staal getekend wordt: zo zie je op een staal van 4 cm een halve meter. */
const STAALSCHAAL = 90;
const beelden = new Map<string, { url: string; breedte: number; hoogte: number }>();

function staalbeeld(materiaal: Patroonmateriaal): { url: string; breedte: number; hoogte: number } {
  const sleutel = `${materiaal.patroon}|${materiaal.kleur}|${materiaal.voegkleur ?? ""}`;
  let beeld = beelden.get(sleutel);
  if (!beeld) {
    // Dubbel zo scherp getekend, voor een scherm met veel pixels.
    const doek = patroonDoek(materiaal, STAALSCHAAL * 2);
    beeld = { url: doek.toDataURL("image/png"), breedte: doek.width / 2, hoogte: doek.height / 2 };
    beelden.set(sleutel, beeld);
  }
  return beeld;
}

/** Hoe een uitsnede van een foto (in breukdelen) een vakje vult, in CSS. */
export function uitsnedeStijl(uitsnede: readonly [number, number, number, number]): CSSProperties {
  const [x0, y0, x1, y1] = uitsnede;
  const [w, h] = [x1 - x0, y1 - y0];
  const plaats = (begin: number, maat: number) => (maat >= 1 ? 0 : (begin / (1 - maat)) * 100);
  return { backgroundSize: `${100 / w}% ${100 / h}%`, backgroundPosition: `${plaats(x0, w)}% ${plaats(y0, h)}%` };
}

/**
 * Een staal: de kleur, het patroon op schaal, of de foto (bij een staal of
 * vlak enkel het stuk dat telt). Op de server enkel de kleur; het patroon
 * tekent de browser erbij.
 */
export function Staalbeeld({ materiaal, className }: { materiaal: Materiaal; className?: string }) {
  const { patroon, kleur, voegkleur, foto, staal } = materiaal;
  const [beeld, setBeeld] = useState<{ url: string; breedte: number; hoogte: number } | null>(null);
  useEffect(() => {
    setBeeld(patroon ? staalbeeld({ patroon, kleur, voegkleur }) : null);
  }, [patroon, kleur, voegkleur]);
  const stijl: CSSProperties =
    foto && staal
      ? { backgroundColor: kleur, backgroundImage: `url(${JSON.stringify(foto)})`, ...uitsnedeStijl(staal.uitsnede) }
      : patroon && beeld
        ? { backgroundColor: kleur, backgroundImage: `url(${beeld.url})`, backgroundSize: `${beeld.breedte}px ${beeld.hoogte}px` }
        : !patroon && foto
          ? { backgroundColor: kleur, backgroundImage: `url(${JSON.stringify(foto)})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { backgroundColor: kleur };
  return <span className={className} style={stijl} aria-hidden="true" />;
}
