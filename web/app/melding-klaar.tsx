"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

const SLEUTEL = "laadkosten:alles-klaar-weggeklikt";

/**
 * De melding dat alles klaarstaat, met een kruisje om ze weg te doen.
 *
 * Ze is een eenmalige geruststelling, geen blijvende mededeling: wie ze een
 * keer gelezen heeft, heeft er niets meer aan. Het wegklikken wordt in de
 * browser onthouden, want het is een voorkeur van wie kijkt en niet iets van
 * de installatie -- op een andere computer of na het wissen van je
 * browsergegevens komt ze gewoon terug.
 *
 * Ze verschijnt bewust opnieuw wanneer er intussen iets misging en weer
 * opgelost is: de melding hangt aan de lijst met aandachtspunten, en die
 * verandert dan van niet-leeg naar leeg.
 */
export function MeldingAllesKlaar() {
  // Serverzijde weten we niet wat de browser onthouden heeft. Zou de melding
  // meteen getoond worden, dan flikkert ze even in beeld bij wie ze al
  // weggeklikt heeft; daarom verschijnt ze pas na het eerste nazicht.
  const [zichtbaar, setZichtbaar] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SLEUTEL) !== "1") setZichtbaar(true);
    } catch {
      // Een browser die opslag weigert (privémodus, strenge instellingen) mag
      // de melding niet doen verdwijnen; dan tonen we ze gewoon elke keer.
      setZichtbaar(true);
    }
  }, []);

  if (!zichtbaar) return null;

  function wegdoen() {
    setZichtbaar(false);
    try {
      window.localStorage.setItem(SLEUTEL, "1");
    } catch {
      // Niet kunnen onthouden is geen reden om ze te laten staan.
    }
  }

  return (
    <div className="melding goed met-kruisje">
      <span>
        Alles staat klaar. Je kan meteen een rapport maken bij{" "}
        <Link href="/rapporten">Rapporten</Link>.
      </span>
      <button type="button" className="kruisje" onClick={wegdoen} aria-label="Melding sluiten">
        ×
      </button>
    </div>
  );
}
