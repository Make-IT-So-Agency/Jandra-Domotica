/**
 * Hoe de verstuurknop bij een bewaard rapport eruit hoort te zien.
 *
 * Puur, zonder databank of omgeving, zodat de vier gevallen vastgelegd kunnen
 * worden in een test. Een knop die uitstaat terwijl hij zou werken is lastig;
 * een knop die aanstaat terwijl versturen onmogelijk is, is erger -- dan klik
 * je en krijg je een foutmelding waar je niets aan hebt.
 */

export interface VerzendKnop {
  label: string;
  /** Uit: klikken heeft geen zin. De reden staat in `reden`. */
  uit: boolean;
  /** Waarom de knop uitstaat, of wat er gebeurt als je hem indrukt. */
  reden: string;
}

export function verzendKnop({
  mailStaatAan,
  adres,
  verstuurdOp,
}: {
  mailStaatAan: boolean;
  adres: string | null;
  verstuurdOp: string | null;
}): VerzendKnop {
  // Altijd hetzelfde woord. Of dit rapport al eens vertrokken is, staat in
  // diezelfde rij al te lezen, en de bevestiging zegt het nog eens; een langer
  // label herhaalt dat alleen maar en duwt de tabel voorbij de schermrand.
  const opnieuw = Boolean(verstuurdOp);
  const label = "Versturen";

  if (!mailStaatAan) {
    return {
      label,
      uit: true,
      reden: "Versturen staat uit op de server: de mailsleutel ontbreekt.",
    };
  }
  if (!adres?.trim()) {
    return {
      label,
      uit: true,
      reden: "Deze vennootschap heeft nog geen e-mailadres. Vul dat eerst in.",
    };
  }

  return {
    label,
    uit: false,
    reden: opnieuw
      ? `Stuurt dit rapport nog eens naar ${adres.trim()}.`
      : `Stuurt dit rapport naar ${adres.trim()}.`,
  };
}
