/** De melding die een actie via de URL meegeeft (?soort=goed|fout&melding=…). */
export function Melding({ soort, melding }: { soort?: string; melding?: string }) {
  if (!melding) return null;
  return <div className={`melding ${soort === "fout" ? "fout" : "goed"}`}>{melding}</div>;
}
