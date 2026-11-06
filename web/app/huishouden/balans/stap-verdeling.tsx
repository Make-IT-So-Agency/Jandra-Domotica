"use client";

import { PERSONEN, PERSOONSNAMEN, type Persoon } from "@/lib/huishouden/balans";
import { urenTekst, type Voorstelgegevens } from "@/lib/huishouden/voorstel";

import { Cijfers, kaartenVan } from "./stap-voorstel";

/**
 * Stap 5: wie heeft wat. De uren en de mentale last rekenen mee met de
 * inschattingen van nu; wie owner is, verandert niet meer tot een nieuwe
 * ronde. Uitlenen, doorgeven en een nieuwe ronde komen in een volgende stap.
 */
export function StapVerdeling({ gegevens }: { gegevens: Voorstelgegevens }) {
  const { voorstel } = gegevens;
  const uitbesteed = voorstel.kaarten.filter((item) => item.eigenaar === "uitbesteed");
  const samen = voorstel.kaarten.filter((item) => item.eigenaar === "samen");

  return (
    <>
      <div className="balans-intro">
        <h2 id="stap-5">Stap 5 · Wie heeft wat</h2>
        <p>
          Owner zijn betekent de hele cyclus: opmerken, plannen en doen, tot het goed genoeg is. Geef elkaar een paar
          weken om erin te groeien zonder bij te sturen. Lukt het even niet, door ziekte of een drukke periode, leen een
          kaart dan tijdelijk uit.
        </p>
      </div>

      <div className="kolommen">
        {PERSONEN.map((persoon: Persoon) => (
          <div key={persoon} className="kolom">
            <h3 className={`kolomkop ${persoon}`}>
              <span>{PERSOONSNAMEN[persoon]}</span>
              <span>{urenTekst(voorstel.totaal[persoon].uren)}</span>
            </h3>
            {kaartenVan(persoon, voorstel.kaarten).map((item) => (
              <div key={item.kaart.id} className={`mini${item.regel === "vast" ? ` ${persoon}` : ""}`}>
                <div className="mini-rij">
                  <span className="mini-titel">{item.kaart.titel}</span>
                  <Cijfers item={item} />
                </div>
                {item.regel === "vast" || item.regel === "elk" ? (
                  <div>
                    <span className={`label-vlag${item.regel === "vast" ? ` ${persoon}` : ""}`}>
                      {item.regel === "vast" ? "Vast" : "Eigen tijd"}
                    </span>
                  </div>
                ) : null}
                {item.kaart.goedGenoeg ? (
                  <p className="werkkaart-goed">
                    <strong>Goed genoeg:</strong> {item.kaart.goedGenoeg}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>

      {uitbesteed.length > 0 || samen.length > 0 ? (
        <div className="labelrij">
          {uitbesteed.length > 0 ? <span className="hint">Uitbesteed:</span> : null}
          {uitbesteed.map((item) => (
            <span key={item.kaart.id} className="label-vlag">
              {item.kaart.titel}
            </span>
          ))}
          {samen.length > 0 ? <span className="hint">Samen:</span> : null}
          {samen.map((item) => (
            <span key={item.kaart.id} className="label-vlag">
              {item.kaart.titel}
            </span>
          ))}
        </div>
      ) : null}

      <p className="melding let-op">
        Elk kwartaal opnieuw bekijken, of bij een grote wissel zoals de start van de bouw, de verhuis of Finn naar school.
      </p>
    </>
  );
}
