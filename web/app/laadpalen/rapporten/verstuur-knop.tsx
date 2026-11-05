"use client";

import { verzendKnop } from "@/lib/verzending";

/**
 * De knop die een bewaard rapport naar zijn vennootschap stuurt.
 *
 * Met een bevestiging ernaast, en het adres staat erin. Een mail is niet terug
 * te halen, en deze knop staat vlak naast Verwijderen; één misklik mag geen
 * document bij een boekhouder leggen. De bevestiging toont bovendien het adres
 * waar het heen gaat, zodat dat ook meteen nagekeken is.
 */
export function VerstuurKnop({
  id,
  referentie,
  adres,
  verstuurdOp,
  mailStaatAan,
  actie,
}: {
  id: string;
  referentie: string;
  adres: string | null;
  verstuurdOp: string | null;
  mailStaatAan: boolean;
  actie: (formulier: FormData) => Promise<void>;
}) {
  const knop = verzendKnop({ mailStaatAan, adres, verstuurdOp });

  if (knop.uit) {
    return (
      <button type="button" className="stil" disabled title={knop.reden}>
        {knop.label}
      </button>
    );
  }

  return (
    <form
      action={actie}
      onSubmit={(gebeurtenis) => {
        const vraag = verstuurdOp
          ? `${referentie} is al verstuurd. Nog eens sturen naar ${adres}?`
          : `${referentie} versturen naar ${adres}?`;
        if (!window.confirm(vraag)) gebeurtenis.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="stil" title={knop.reden}>
        {knop.label}
      </button>
    </form>
  );
}
