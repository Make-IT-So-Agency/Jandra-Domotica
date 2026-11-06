import type { Metadata } from "next";

import { GeenToegang } from "@/components/geen-toegang";
import {
  ander,
  akkoordMetLijst,
  domeinen,
  magInschatten,
  toonScoresVanAnder,
  voortgang,
  type Stap2Gegevens,
} from "@/lib/huishouden/balans";
import { biedingenVoorVoorstel, botsendeKaarten, type Stap3Gegevens } from "@/lib/huishouden/bieden";
import {
  leesAkkoorden,
  leesBalans,
  leesBiedingen,
  leesUitleningen,
  leesInschattingen,
  leesVerdeling,
  leesVerschuivingen,
} from "@/lib/huishouden/opslag";
import { berekenVoorstel, mentaalVan, urenVan, voeltGoed, type Voorstelgegevens } from "@/lib/huishouden/voorstel";
import { vereistGebruiker } from "@/lib/toegang";

import { Balans } from "./balans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "De balans" };

/** De balans: Jan en Sandra verdelen de werkstromen van het gezin. Zie huishouden/LEESMIJ.md. */
export default async function Balanspagina() {
  const ik = await vereistGebruiker();
  if (ik.huishouden === null) return <GeenToegang wat="Huishouden" voor="Jan en Sandra" />;

  const { ronde, kaarten, lijstakkoorden } = await leesBalans();

  let stap2: Stap2Gegevens | null = null;
  let stap3: Stap3Gegevens | null = null;
  let voorstel: Voorstelgegevens | null = null;
  if (magInschatten(ronde)) {
    const { invoer, beschikbareTijd } = await leesInschattingen(ronde);
    const botsend = botsendeKaarten(kaarten, invoer);
    const biedingen =
      ronde.fase === "inschatten" ? { jan: new Map<number, number>(), sandra: new Map<number, number>() } : await leesBiedingen(ronde);

    // Stap 3: enkel je eigen biedingen; die van de ander zie je pas in het
    // voorstel, als reden bij een kaart ("60 tegen 40").
    if (ronde.fase !== "inschatten") {
      const klaar = await leesAkkoorden(ronde, "bieden");
      stap3 = {
        kaarten: botsend.map((kaart) => ({ kaart, uren: urenVan(kaart, invoer), mentaal: mentaalVan(kaart, invoer) })),
        mijn: Object.fromEntries(biedingen[ik.huishouden]),
        klaar: { jan: klaar.some((a) => a.persoon === "jan"), sandra: klaar.some((a) => a.persoon === "sandra") },
      };
    }

    // Vanaf het voorstel zijn de keuzes van allebei zichtbaar, als reden bij
    // een kaart. In stap 5 telt de vastgelegde verdeling in plaats van de
    // verschuivingen.
    if (ronde.fase === "voorstel" || ronde.fase === "vastgelegd") {
      const [verschuivingen, akkoorden, uitleningen] = await Promise.all([
        ronde.fase === "voorstel" ? leesVerschuivingen(ronde) : leesVerdeling(ronde),
        leesAkkoorden(ronde, "voorstel"),
        ronde.fase === "vastgelegd" ? leesUitleningen(ronde) : Promise.resolve(new Map()),
      ]);
      voorstel = {
        voorstel: berekenVoorstel({
          kaarten,
          invoer,
          beschikbareTijd,
          verschuivingen,
          biedingen: biedingenVoorVoorstel(biedingen, new Set(botsend.map((kaart) => kaart.id))),
        }),
        voeltGoed: voeltGoed(ronde, akkoorden),
        uitleningen: Object.fromEntries(uitleningen),
      };
    }

    const stand = {
      jan: voortgang(kaarten, invoer.jan, beschikbareTijd.jan),
      sandra: voortgang(kaarten, invoer.sandra, beschikbareTijd.sandra),
    };
    // Blind voor de ander: enkel je eigen keuzes, en de scores van de ander
    // pas als jullie verder zijn dan stap 2. Claims van de ander nooit.
    const vanAnder = invoer[ander(ik.huishouden)];
    stap2 = {
      mijn: Object.fromEntries(invoer[ik.huishouden]),
      mijnTijd: beschikbareTijd[ik.huishouden],
      stand,
      ander: toonScoresVanAnder(ronde)
        ? Object.fromEntries([...vanAnder].map(([id, { tijd, last }]) => [id, { tijd, last }]))
        : null,
    };
  }

  return (
    <Balans
      ik={ik.huishouden}
      ronde={ronde}
      kaarten={kaarten}
      akkoord={akkoordMetLijst(ronde, lijstakkoorden)}
      domeinen={domeinen(kaarten)}
      stap2={stap2}
      stap3={stap3}
      voorstel={voorstel}
    />
  );
}
