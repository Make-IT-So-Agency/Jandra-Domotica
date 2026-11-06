import type { Metadata } from "next";

import { GeenToegang } from "@/components/geen-toegang";
import { akkoordMetLijst, domeinen } from "@/lib/huishouden/balans";
import { leesBalans } from "@/lib/huishouden/opslag";
import { vereistGebruiker } from "@/lib/toegang";

import { Balans } from "./balans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "De balans" };

/** De balans: Jan en Sandra verdelen de werkstromen van het gezin. Zie huishouden/LEESMIJ.md. */
export default async function Balanspagina() {
  const ik = await vereistGebruiker();
  if (ik.huishouden === null) return <GeenToegang wat="Huishouden" voor="Jan en Sandra" />;

  const { ronde, kaarten, lijstakkoorden } = await leesBalans();

  return (
    <Balans
      ik={ik.huishouden}
      ronde={ronde}
      kaarten={kaarten}
      akkoord={akkoordMetLijst(ronde, lijstakkoorden)}
      domeinen={domeinen(kaarten)}
    />
  );
}
