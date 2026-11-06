"use client";

import { PERSONEN, PERSOONSNAMEN, ander, type Persoon, type Ronde } from "@/lib/huishouden/balans";
import {
  halfJes,
  magUitbesteden,
  urenTekst,
  type Voorstelgegevens,
  type Voorstelkaart,
} from "@/lib/huishouden/voorstel";

import { terugNaarVoorstelActie, vastleggenActie, verschuifActie, voeltGoedActie } from "./acties";
import type { Voer } from "./balans";

/** De kaarten van één persoon: eerst wat het voorstel of jullie zelf toewezen, dan de vaste kaarten, dan de eigen tijd. */
export function kaartenVan(persoon: Persoon, kaarten: Voorstelkaart[]): Voorstelkaart[] {
  const soort = (item: Voorstelkaart) => (item.regel === "vast" ? 1 : item.regel === "elk" ? 2 : 0);
  return kaarten
    .filter((item) => item.eigenaar === persoon || item.eigenaar === "elk")
    .sort((a, b) => soort(a) - soort(b) || a.kaart.volgorde - b.kaart.volgorde);
}

/** "~3,5 u ×1,5" en "Mentaal 3,5". */
export function Cijfers({ item }: { item: Voorstelkaart }) {
  return (
    <span className="mini-cijfers">
      <span className="label-vlag">
        {urenTekst(item.uren)}
        {item.compensatie ? " ×1,5" : ""}
      </span>
      {item.regel !== "elk" ? <span className="label-vlag">Mentaal {halfJes(item.mentaal)}</span> : null}
    </span>
  );
}

/** Stap 4: het voorstel, en samen bijsturen tot het voor jullie allebei goed voelt. */
export function StapVoorstel({
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
  const { voorstel, voeltGoed } = gegevens;
  const open = ronde.fase === "voorstel";
  const uitbesteed = voorstel.kaarten.filter((item) => item.eigenaar === "uitbesteed");
  const samen = voorstel.kaarten.filter((item) => item.eigenaar === "samen");

  return (
    <>
      <div className="balans-intro">
        <h2 id="stap-4">Stap 4 · Voorstel en samen bijsturen</h2>
        <p>
          Eerst gaat elke kaart naar wie ze graag doet, dan naar wie ze het liefst wou, en de rest zo dat de weegschaal in
          evenwicht komt. Kaarten die niemand graag doet, tellen 1,5 keer. Verschuif samen tot het voor jullie allebei
          goed voelt.
        </p>
      </div>

      {!open ? <p className="melding info">Jullie verdeling ligt vast. Je vindt ze bij stap 5.</p> : null}

      {voorstel.vanzelf > 0 ? (
        <p className="melding goed cheer">
          {voorstel.vanzelf} {voorstel.vanzelf === 1 ? "kaart vond" : "kaarten vonden"} vanzelf een thuis bij iemand die
          ze graag doet of ze niet erg vindt.
        </p>
      ) : null}

      <div className="kolommen">
        {PERSONEN.map((persoon) => (
          <div key={persoon} className="kolom">
            <h3 className={`kolomkop ${persoon}`}>
              <span>{PERSOONSNAMEN[persoon]}</span>
              <span>{urenTekst(voorstel.totaal[persoon].uren)}</span>
            </h3>
            {kaartenVan(persoon, voorstel.kaarten).map((item) => (
              <Voorstelkaartje key={item.kaart.id} item={item} persoon={persoon} open={open} voer={voer} />
            ))}
          </div>
        ))}
      </div>

      {uitbesteed.length > 0 ? (
        <section className="kolom" aria-labelledby="uitbesteed">
          <h3 id="uitbesteed">Uitbesteed</h3>
          {uitbesteed.map((item) => (
            <div key={item.kaart.id} className="mini verschoven">
              <div className="mini-rij">
                <span className="mini-titel">{item.kaart.titel}</span>
                <Cijfers item={item} />
              </div>
              {open ? (
                <div className="mini-rij rechts">
                  <button
                    type="button"
                    className="stil klein"
                    onClick={() => voer(() => verschuifActie(item.kaart.id, "terug"))}
                  >
                    Terughalen
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {samen.length > 0 ? (
        <section className="kolom" aria-labelledby="samen">
          <h3 id="samen">Samen</h3>
          <p className="hint">Doen jullie samen, telt niet mee in de weegschaal.</p>
          <div className="labelrij">
            {samen.map((item) => (
              <span key={item.kaart.id} className="label-vlag">
                {item.kaart.titel}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {open && voorstel.verschoven > 0 ? (
        <div className="labelrij">
          <span className="label-vlag">
            {voorstel.verschoven} {voorstel.verschoven === 1 ? "kaart" : "kaarten"} samen verschoven
          </span>
          <button type="button" className="stil klein" onClick={() => voer(terugNaarVoorstelActie)}>
            Terug naar het voorstel
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="balans-onder">
          <div className="labelrij">
            {PERSONEN.map((persoon) => (
              <span key={persoon} className={`label-vlag ${voeltGoed[persoon] ? persoon : ""}`}>
                {PERSOONSNAMEN[persoon]} {voeltGoed[persoon] ? "voelt zich hier goed bij" : "nog niet"}
              </span>
            ))}
          </div>
          <div className="knoppenrij">
            {voeltGoed[ik] ? (
              <button type="button" className="stil" onClick={() => voer(() => voeltGoedActie(false, ronde.voorstelVersie))}>
                Toch nog niet
              </button>
            ) : (
              <button type="button" onClick={() => voer(() => voeltGoedActie(true, ronde.voorstelVersie))}>
                Dit voelt goed voor mij
              </button>
            )}
            {voeltGoed.jan && voeltGoed.sandra ? (
              <button type="button" onClick={() => voer(vastleggenActie)}>
                Verdeling vastleggen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Voorstelkaartje({
  item,
  persoon,
  open,
  voer,
}: {
  item: Voorstelkaart;
  persoon: Persoon;
  open: boolean;
  voer: Voer;
}) {
  const deAnder = ander(persoon);
  const vast = item.regel === "vast";
  const eigenTijd = item.regel === "elk";
  const klasse = ["mini", vast ? persoon : "", item.verschoven ? "verschoven" : ""].filter(Boolean).join(" ");

  return (
    <div className={klasse}>
      <div className="mini-rij">
        <span className="mini-titel">{item.kaart.titel}</span>
        <Cijfers item={item} />
      </div>
      <div className="mini-rij">
        <span>
          {vast ? <span className={`label-vlag ${persoon}`}>Vast afgesproken</span> : null}
          {eigenTijd ? <span className="label-vlag">Eigen tijd, telt mee in je uren</span> : null}
          {item.verschoven ? (
            <span className="label-vlag">Samen verschoven</span>
          ) : item.reden ? (
            <span className={`label-vlag${item.nipt ? "" : " goed"}`}>{item.reden}</span>
          ) : null}
        </span>
        {open && item.kaart.verdeling === "spel" ? (
          <span className="knoppenrij mini-knoppen">
            <button
              type="button"
              className="stil klein"
              onClick={() => voer(() => verschuifActie(item.kaart.id, deAnder))}
            >
              Naar {PERSOONSNAMEN[deAnder]}
            </button>
            {magUitbesteden(item) ? (
              <button
                type="button"
                className="stil klein"
                onClick={() => voer(() => verschuifActie(item.kaart.id, "uitbesteed"))}
              >
                Uitbesteden
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
