import { PERSONEN, PERSOONSNAMEN, type Persoon } from "@/lib/huishouden/balans";
import { halfJes, overschreden, urenTekst, vulling, type Lading } from "@/lib/huishouden/voorstel";

/**
 * Het zijpaneel. In stap 2 en 3 blijft het bewust leeg: anders kan je
 * afleiden wat de ander koos. Vanaf het voorstel toont het eerst de mentale
 * last over de volle breedte, en daaronder per persoon de uren tegenover de
 * beschikbare tijd. Een overschrijding is amber, nooit rood.
 */
export function Weegschaal({ totaal }: { totaal: Record<Persoon, Lading> | null }) {
  return (
    <aside className="zijpaneel" aria-labelledby="weegschaal">
      <h2 id="weegschaal" className="bovenschrift">
        Weegschaal
      </h2>
      {totaal ? (
        <>
          <MentaleLast totaal={totaal} />
          <div className="weegschaal-uren">
            <div className="bovenschrift">Uren per week, met hobbytijd</div>
            <div className="weegschaal-kolommen">
              {PERSONEN.map((persoon) => (
                <Uren key={persoon} persoon={persoon} lading={totaal[persoon]} />
              ))}
            </div>
          </div>
          <p className="hint">Kaarten die niemand graag doet, tellen 1,5 keer. Je beschikbare tijd pas je aan in stap 2.</p>
        </>
      ) : (
        <p>De weegschaal verschijnt in het voorstel. Zo vul je alles in zonder te zien wat de ander koos.</p>
      )}
    </aside>
  );
}

function MentaleLast({ totaal }: { totaal: Record<Persoon, Lading> }) {
  const som = totaal.jan.mentaal + totaal.sandra.mentaal;
  const aandeel = (persoon: Persoon) => (som === 0 ? 50 : (totaal[persoon].mentaal / som) * 100);
  return (
    <div className="weegschaal-last">
      <div className="bovenschrift">Mentale last</div>
      <div className="weegschaal-getallen">
        {PERSONEN.map((persoon) => (
          <span key={persoon} className={`wie ${persoon}`}>
            {PERSOONSNAMEN[persoon]} {halfJes(totaal[persoon].mentaal)}
          </span>
        ))}
      </div>
      <div
        className="schaalbalk"
        role="img"
        aria-label={`Mentale last: Jan ${halfJes(totaal.jan.mentaal)}, Sandra ${halfJes(totaal.sandra.mentaal)}`}
      >
        {PERSONEN.map((persoon) => (
          <i key={persoon} className={persoon} style={{ width: `${aandeel(persoon)}%` }} />
        ))}
      </div>
    </div>
  );
}

function Uren({ persoon, lading }: { persoon: Persoon; lading: Lading }) {
  const over = overschreden(lading);
  return (
    <div className={`weegschaal-persoon${over ? " over" : ""}`}>
      <div className={`wie ${persoon}`}>{PERSOONSNAMEN[persoon]}</div>
      <div className="groot-getal">{urenTekst(lading.uren)}</div>
      <div className="hint">
        {lading.beschikbaar === null
          ? "beschikbaar?"
          : `${over ? "meer dan" : "van"} ${lading.beschikbaar} u`}
      </div>
      {lading.beschikbaar !== null ? (
        <div className="meter" aria-hidden="true">
          <i className={over ? "over" : persoon} style={{ width: `${vulling(lading)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
