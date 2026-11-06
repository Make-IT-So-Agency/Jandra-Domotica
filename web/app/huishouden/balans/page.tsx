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
import {
  leesAkkoorden,
  leesBalans,
  leesInschattingen,
  leesVerdeling,
  leesVerschuivingen,
} from "@/lib/huishouden/opslag";
import { berekenVoorstel, voeltGoed, type Voorstelgegevens } from "@/lib/huishouden/voorstel";
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
  let voorstel: Voorstelgegevens | null = null;
  if (magInschatten(ronde)) {
    const { invoer, beschikbareTijd } = await leesInschattingen(ronde);

    // Vanaf het voorstel zijn de keuzes van allebei zichtbaar, als reden bij
    // een kaart. In stap 5 telt de vastgelegde verdeling in plaats van de
    // verschuivingen.
    if (ronde.fase === "voorstel" || ronde.fase === "vastgelegd") {
      const [verschuivingen, akkoorden] = await Promise.all([
        ronde.fase === "voorstel" ? leesVerschuivingen(ronde) : leesVerdeling(ronde),
        leesAkkoorden(ronde, "voorstel"),
      ]);
      voorstel = {
        voorstel: berekenVoorstel({ kaarten, invoer, beschikbareTijd, verschuivingen }),
        voeltGoed: voeltGoed(ronde, akkoorden),
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
      voorstel={voorstel}
    />
  );
}
