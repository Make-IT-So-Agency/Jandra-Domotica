"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  STAPPEN,
  isGebouwd,
  stapVan,
  type Kaart,
  type Persoon,
  type Ronde,
  type Stap2Gegevens,
} from "@/lib/huishouden/balans";

import { allesResettenActie, type Resultaat } from "./acties";
import { StapInschatten } from "./stap-inschatten";
import { StapLijst } from "./stap-lijst";

/** Voert een actie uit, met "Bewaren…" en daarna haar melding onderaan het scherm. */
export type Voer = (actie: () => Promise<Resultaat>) => Promise<Resultaat>;

/** Zo vaak kijkt de pagina of de ander iets wijzigde, zolang ze in beeld is. */
const VERVERS_MS = 5000;

/**
 * Jan en Sandra werken elk op een eigen toestel, tegelijk. De pagina haalt
 * daarom om de paar seconden op wat er nieuw is, en meteen als je ernaar
 * terugkeert. Wat je zelf aan het typen bent, blijft staan.
 */
function useLiveVerversen() {
  const router = useRouter();
  useEffect(() => {
    const ververs = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const klok = window.setInterval(ververs, VERVERS_MS);
    document.addEventListener("visibilitychange", ververs);
    return () => {
      window.clearInterval(klok);
      document.removeEventListener("visibilitychange", ververs);
    };
  }, [router]);
}

export function Balans({
  ik,
  ronde,
  kaarten,
  akkoord,
  domeinen,
  stap2,
}: {
  ik: Persoon;
  ronde: Ronde;
  kaarten: Kaart[];
  akkoord: Record<Persoon, boolean>;
  domeinen: string[];
  stap2: Stap2Gegevens | null;
}) {
  useLiveVerversen();
  const router = useRouter();
  const [melding, setMelding] = useState("");

  // De pagina opent op de stap waar jullie nu staan. Zet de ander het spel
  // een stap verder, dan volg je mee.
  const huidig = stapVan(ronde.fase);
  const [bekeken, setBekeken] = useState(huidig);
  useEffect(() => setBekeken(huidig), [huidig]);

  // De bewaarmelding verdwijnt vanzelf, behalve zolang er iets bewaard wordt.
  useEffect(() => {
    if (!melding || melding === "Bewaren…") return;
    const klok = window.setTimeout(() => setMelding(""), 3000);
    return () => window.clearTimeout(klok);
  }, [melding]);

  const voer: Voer = async (actie) => {
    setMelding("Bewaren…");
    let resultaat: Resultaat;
    try {
      resultaat = await actie();
    } catch {
      resultaat = { ok: false, melding: "Bewaren lukte niet. Probeer het opnieuw." };
    }
    setMelding(resultaat.melding);
    router.refresh();
    return resultaat;
  };

  const metZijpaneel = bekeken >= 2;

  return (
    <div className="balans">
      <header className="balans-kop">
        <div>
          <div className="bovenschrift">Jandra · Huishouden</div>
          <h1>De balans</h1>
        </div>
      </header>

      <Stappenbalk huidig={huidig} bekeken={bekeken} kies={setBekeken} />

      <div className={`balans-werk${metZijpaneel ? " met-zijpaneel" : ""}`}>
        <section className="balans-stap" aria-labelledby={`stap-${bekeken}`}>
          {bekeken === 1 ? (
            <StapLijst ik={ik} ronde={ronde} kaarten={kaarten} akkoord={akkoord} domeinen={domeinen} voer={voer} />
          ) : null}
          {bekeken === 2 && stap2 ? (
            <StapInschatten ik={ik} ronde={ronde} kaarten={kaarten} gegevens={stap2} voer={voer} />
          ) : null}
          <AllesResetten voer={voer} />
        </section>

        {metZijpaneel ? <Weegschaal /> : null}
      </div>

      <p className="bewaarmelding" role="status" aria-live="polite">
        {melding}
      </p>
    </div>
  );
}

/**
 * De vijf stappen. Je kan terug naar een stap die al bereikt is; vooruit gaat
 * enkel met de knop onderaan een stap. Een stap die nog niet gebouwd is, staat
 * uit.
 */
function Stappenbalk({ huidig, bekeken, kies }: { huidig: number; bekeken: number; kies: (stap: number) => void }) {
  return (
    <nav className="stappenbalk" aria-label="Stappen">
      <ol>
        {STAPPEN.map((stap, index) => {
          const nummer = index + 1;
          const bereikbaar = nummer <= huidig && isGebouwd(stap.fase);
          const klasse = nummer === bekeken ? "huidig" : nummer <= huidig ? "af" : "later";
          return (
            <li key={stap.fase}>
              <button
                type="button"
                className={klasse}
                disabled={!bereikbaar}
                aria-current={nummer === bekeken ? "step" : undefined}
                onClick={() => {
                  kies(nummer);
                  window.scrollTo(0, 0);
                }}
              >
                <span>Stap {nummer}</span>
                <b>{stap.naam}</b>
                <span>{stap.ondertitel}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Het zijpaneel. In stap 2 en 3 blijft het bewust leeg: anders kan je afleiden wat de ander koos. */
function Weegschaal() {
  return (
    <aside className="zijpaneel" aria-labelledby="weegschaal">
      <h2 id="weegschaal" className="bovenschrift">
        Weegschaal
      </h2>
      <p>De weegschaal verschijnt in het voorstel. Zo vul je alles in zonder te zien wat de ander koos.</p>
    </aside>
  );
}

/** Onderaan elke stap. De bevestiging staat op de pagina zelf, nooit in een venster van de browser. */
function AllesResetten({ voer }: { voer: Voer }) {
  const [bevestigen, setBevestigen] = useState(false);
  const vak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bevestigen) vak.current?.scrollIntoView({ block: "center" });
  }, [bevestigen]);

  return (
    <div className="resetzone">
      {bevestigen ? (
        <div ref={vak} className="melding let-op resetbevestiging" role="alertdialog" aria-labelledby="reset-titel">
          <strong id="reset-titel">Alles resetten?</strong>
          <p>
            Dit wist voor jullie allebei de inschattingen, claims, biedingen, beschikbare tijd en verdeling. Jullie
            starten opnieuw bij stap 1. De kaarten blijven staan. Dit kan niet ongedaan gemaakt worden.
          </p>
          <div className="knoppenrij">
            <button
              type="button"
              className="gevaar"
              onClick={async () => {
                setBevestigen(false);
                await voer(allesResettenActie);
              }}
            >
              Ja, alles resetten
            </button>
            <button type="button" className="stil" onClick={() => setBevestigen(false)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="stil klein" onClick={() => setBevestigen(true)}>
          Alles resetten
        </button>
      )}
    </div>
  );
}
