/**
 * Een heel kleine PDF-schrijver voor testplannen: vlakken, lijnen, bogen en
 * tekst in Helvetica. Zo maken de tests hun eigen plannen, en komt er nooit
 * een echt plan in de repository.
 *
 * De coördinaten zijn die van PDF zelf: in punten, met de oorsprong
 * linksonder en y naar boven.
 */

export interface Bladzijde {
  breedte: number;
  hoogte: number;
  /** De inhoud: PDF-operatoren, één per regel. */
  inhoud: string[];
  /** /Rotate van het blad. */
  draai?: 0 | 90 | 180 | 270;
}

/** Een getal zoals PDF het wil: zonder exponent, met hoogstens vier cijfers na de komma. */
export function g(waarde: number): string {
  const afgerond = Math.round(waarde * 10000) / 10000;
  return Object.is(afgerond, -0) ? "0" : String(afgerond);
}

function kleur(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export const pdf = {
  bewaar: () => "q",
  herstel: () => "Q",
  matrix: (a: number, b: number, c: number, d: number, e: number, f: number) =>
    `${g(a)} ${g(b)} ${g(c)} ${g(d)} ${g(e)} ${g(f)} cm`,
  vulkleur: (hex: string) => `${kleur(hex).map(g).join(" ")} rg`,
  lijnkleur: (hex: string) => `${kleur(hex).map(g).join(" ")} RG`,
  dikte: (punten: number) => `${g(punten)} w`,
  rechthoek: (x: number, y: number, b: number, h: number) => `${g(x)} ${g(y)} ${g(b)} ${g(h)} re`,
  veelhoek: (punten: [number, number][]) =>
    `${punten.map(([x, y], i) => `${g(x)} ${g(y)} ${i === 0 ? "m" : "l"}`).join(" ")} h`,
  lijn: (a: [number, number], b: [number, number]) => `${g(a[0])} ${g(a[1])} m ${g(b[0])} ${g(b[1])} l`,
  boog: (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]) =>
    `${g(p0[0])} ${g(p0[1])} m ${[p1, p2, p3].map(([x, y]) => `${g(x)} ${g(y)}`).join(" ")} c`,
  vul: () => "f",
  trek: () => "S",
  vulEnTrek: () => "B",
  /** Tekst met het begin van de basislijn op (x, y), eventueel gedraaid tegen de klok in. */
  tekst: (x: number, y: number, grootte: number, tekst: string, hoek = 0) => {
    const r = (hoek * Math.PI) / 180;
    const veilig = tekst.replace(/([\\()])/g, "\\$1");
    return `BT /F1 ${g(grootte)} Tf ${g(Math.cos(r))} ${g(Math.sin(r))} ${g(-Math.sin(r))} ${g(Math.cos(r))} ${g(x)} ${g(y)} Tm (${veilig}) Tj ET`;
  },
};

/** Maakt de PDF. Tekst in WinAnsi, dus "m²" kan ook. */
export function maakPdf(bladzijden: Bladzijde[]): Uint8Array {
  const objecten: string[] = [];
  const voeg = (inhoud: string) => {
    objecten.push(inhoud);
    return objecten.length;
  };

  const catalogus = voeg("");
  const paginas = voeg("");
  const lettertype = voeg("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kinderen: number[] = [];
  for (const blad of bladzijden) {
    const stroom = blad.inhoud.join("\n");
    const inhoud = voeg(`<< /Length ${stroom.length} >>\nstream\n${stroom}\nendstream`);
    kinderen.push(
      voeg(
        `<< /Type /Page /Parent ${paginas} 0 R /MediaBox [0 0 ${g(blad.breedte)} ${g(blad.hoogte)}]` +
          `${blad.draai ? ` /Rotate ${blad.draai}` : ""} /Resources << /Font << /F1 ${lettertype} 0 R >> >>` +
          ` /Contents ${inhoud} 0 R >>`,
      ),
    );
  }
  objecten[catalogus - 1] = `<< /Type /Catalog /Pages ${paginas} 0 R >>`;
  objecten[paginas - 1] = `<< /Type /Pages /Kids [${kinderen.map((k) => `${k} 0 R`).join(" ")}] /Count ${kinderen.length} >>`;

  let tekst = "%PDF-1.4\n";
  const plaatsen: number[] = [];
  objecten.forEach((inhoud, i) => {
    plaatsen.push(tekst.length);
    tekst += `${i + 1} 0 obj\n${inhoud}\nendobj\n`;
  });
  const xref = tekst.length;
  tekst += `xref\n0 ${objecten.length + 1}\n0000000000 65535 f \n`;
  for (const plaats of plaatsen) tekst += `${String(plaats).padStart(10, "0")} 00000 n \n`;
  tekst += `trailer\n<< /Size ${objecten.length + 1} /Root ${catalogus} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Latin-1: elk teken is één byte, zoals WinAnsi en de offsets hierboven verwachten.
  return Uint8Array.from(tekst, (teken) => teken.charCodeAt(0) & 0xff);
}
