"use client";

import { useEffect, useRef, useState } from "react";

import { PERSONEN, PERSOONSNAMEN, ander, type Persoon, type Ronde } from "@/lib/huishouden/balans";
import { magDoorgeven, magUitlenen } from "@/lib/huishouden/verdeling";
import { urenTekst, type Voorstelgegevens, type Voorstelkaart } from "@/lib/huishouden/voorstel";

import { doorgevenActie, nieuweRondeActie, uitleenActie } from "./acties";
import type { Voer } from "./balans";
import { Cijfers, kaartenVan } from "./stap-voorstel";

/**
 * Stap 5: wie heeft wat. De uren en de mentale last rekenen mee met de
 * inschattingen van nu; wie owner is, verandert niet meer tot een nieuwe
 * ronde. Enkel de owner ziet de knoppen bij een kaart: tijdelijk uitlenen,
 * en bij een vaste kaart doorgeven.
 */
export function StapVerdeling({
  ik,
  ronde,
  gegevens,
  voer,
}: {
  ik: Persoon;
  ronde: Ronde;
  gegevens: Voorstelgegevens;
  voer: Voer;
}) {
  const { voorstel, uitleningen } = gegevens;
  const [doorTeGeven, setDoorTeGeven] = useState<number | null>(null);
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
        {PERSONEN.map((persoon) => (
          <div key={persoon} className="kolom">
            <h3 className={`kolomkop ${persoon}`}>
              <span>{PERSOONSNAMEN[persoon]}</span>
              <span>{urenTekst(voorstel.totaal[persoon].uren)}</span>
            </h3>
            {kaartenVan(persoon, voorstel.kaarten).map((item) => (
              <Verdeelkaartje
                key={item.kaart.id}
                item={item}
                persoon={persoon}
                ik={ik}
                ronde={ronde}
                uitgeleendAan={uitleningen[item.kaart.id] ?? null}
                bevestigDoorgeven={doorTeGeven === item.kaart.id}
                vraagDoorgeven={() => setDoorTeGeven(item.kaart.id)}
                annuleer={() => setDoorTeGeven(null)}
                voer={voer}
              />
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

      {ronde.fase === "vastgelegd" ? <NieuweRonde voer={voer} /> : null}
    </>
  );
}

function Verdeelkaartje({
  item,
  persoon,
  ik,
  ronde,
  uitgeleendAan,
  bevestigDoorgeven,
  vraagDoorgeven,
  annuleer,
  voer,
}: {
  item: Voorstelkaart;
  persoon: Persoon;
  ik: Persoon;
  ronde: Ronde;
  uitgeleendAan: Persoon | null;
  bevestigDoorgeven: boolean;
  vraagDoorgeven: () => void;
  annuleer: () => void;
  voer: Voer;
}) {
  const vast = item.regel === "vast";
  const eigenTijd = item.regel === "elk";
  // Hobbytijd staat in beide kolommen; de knoppen horen enkel bij je eigen kaarten.
  const vanMij = persoon === ik;
  const uitlenen = vanMij && magUitlenen(ronde, item, ik).ok;
  const doorgeven = vanMij && magDoorgeven(ronde, item, ik).ok;
  const deAnder = PERSOONSNAMEN[ander(persoon)];

  return (
    <div className={`mini${vast ? ` ${persoon}` : ""}${uitgeleendAan ? " verschoven" : ""}`}>
      <div className="mini-rij">
        <span className="mini-titel">{item.kaart.titel}</span>
        <Cijfers item={item} />
      </div>
      {vast || eigenTijd || uitgeleendAan ? (
        <div className="labelrij">
          {vast ? <span className={`label-vlag ${persoon}`}>Vast</span> : null}
          {eigenTijd ? <span className="label-vlag">Eigen tijd</span> : null}
          {uitgeleendAan ? (
            <span className={`label-vlag ${uitgeleendAan}`}>Tijdelijk bij {PERSOONSNAMEN[uitgeleendAan]}</span>
          ) : null}
        </div>
      ) : null}
      {item.kaart.goedGenoeg ? (
        <p className="werkkaart-goed">
          <strong>Goed genoeg:</strong> {item.kaart.goedGenoeg}
        </p>
      ) : null}

      {bevestigDoorgeven ? (
        <div className="mini-rij rechts bevestig">
          <span className="hint">Voor altijd vast bij {deAnder}?</span>
          <button
            type="button"
            className="klein"
            onClick={async () => {
              annuleer();
              await voer(() => doorgevenActie(item.kaart.id));
            }}
          >
            Ja
          </button>
          <button type="button" className="stil klein" onClick={annuleer}>
            Nee
          </button>
        </div>
      ) : uitlenen || doorgeven ? (
        <div className="mini-rij rechts">
          {uitlenen ? (
            <button
              type="button"
              className="stil klein"
              onClick={() => voer(() => uitleenActie(item.kaart.id, uitgeleendAan === null))}
            >
              {uitgeleendAan ? "Terugnemen" : "Tijdelijk uitlenen"}
            </button>
          ) : null}
          {doorgeven ? (
            <button type="button" className="stil klein" onClick={vraagDoorgeven}>
              Doorgeven aan {deAnder}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Nieuwe ronde starten", met een korte bevestiging op de pagina zelf. */
function NieuweRonde({ voer }: { voer: Voer }) {
  const [bevestigen, setBevestigen] = useState(false);
  const vak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bevestigen) vak.current?.scrollIntoView({ block: "center" });
  }, [bevestigen]);

  return bevestigen ? (
    <div ref={vak} className="melding info resetbevestiging" role="alertdialog" aria-labelledby="nieuwe-ronde">
      <strong id="nieuwe-ronde">Nieuwe ronde starten?</strong>
      <p>Jullie inschattingen en beschikbare tijd blijven staan; claims en biedingen beginnen opnieuw.</p>
      <div className="knoppenrij">
        <button
          type="button"
          onClick={async () => {
            setBevestigen(false);
            await voer(nieuweRondeActie);
          }}
        >
          Ja, nieuwe ronde
        </button>
        <button type="button" className="stil" onClick={() => setBevestigen(false)}>
          Annuleren
        </button>
      </div>
    </div>
  ) : (
    <div className="knoppenrij">
      <button type="button" onClick={() => setBevestigen(true)}>
        Nieuwe ronde starten
      </button>
    </div>
  );
}
