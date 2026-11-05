import { redirect } from "next/navigation";

import { Startmodules } from "@/components/startmodules";
import { lijstHuizen } from "@/lib/bouw/huizen";
import { menuVoor } from "@/lib/navigatie";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

export const dynamic = "force-dynamic";

/**
 * De startpagina van de app: elke module die je mag zien, met haar
 * belangrijkste pagina's. Wie maar één module heeft, gaat meteen daarheen.
 */
export default async function Startpagina() {
  const ik = await vereistGebruiker();
  const huizen = magBouwZien(ik)
    ? (await lijstHuizen().catch(() => [])).map(({ id, naam, soort }) => ({ id, naam, soort }))
    : [];
  const menu = menuVoor(ik, huizen);
  if (menu.length === 1) redirect(menu[0].start);

  return (
    <>
      <h1>Start</h1>
      <p className="inleiding">Kies een module. Je kan altijd wisselen met de balk links, of onderaan op de gsm.</p>

      <Startmodules menu={menu} />
    </>
  );
}
