import { describe, expect, it } from "vitest";

import {
  isGeldigeRol,
  magGebruikerBeheren,
  magGebruikerVerwijderen,
  magGebruikerWijzigen,
  magGebruikersBeheren,
  magInstellingenBeheren,
  magRapportenMaken,
  magUitnodigen,
  magVennootschapZien,
  normaliseerEmail,
  toewijsbareRollen,
  zichtbareVennootschappen,
  type Gebruiker,
} from "@/lib/rollen";

const VENN_A = "aaaaaaaa-0000-0000-0000-000000000001";
const VENN_B = "bbbbbbbb-0000-0000-0000-000000000002";

function gebruiker(overschrijf: Partial<Gebruiker> = {}): Gebruiker {
  return {
    id: "u1",
    email: "iemand@voorbeeld.be",
    naam: null,
    rol: "kijker",
    vennootschap_id: VENN_A,
    vasteBeheerder: false,
    ...overschrijf,
  };
}

const HOOFD = gebruiker({
  id: "hoofd",
  email: "jan@voorbeeld.be",
  rol: "hoofdbeheerder",
  vennootschap_id: null,
});
const BEHEERDER_A = gebruiker({ id: "ba", email: "beheer-a@voorbeeld.be", rol: "vennootschapsbeheerder" });
const BEHEERDER_B = gebruiker({
  id: "bb",
  email: "beheer-b@voorbeeld.be",
  rol: "vennootschapsbeheerder",
  vennootschap_id: VENN_B,
});
const KIJKER_A = gebruiker({ id: "ka", email: "kijk-a@voorbeeld.be" });
const KIJKER_B = gebruiker({ id: "kb", email: "kijk-b@voorbeeld.be", vennootschap_id: VENN_B });

describe("zichtbaarheid van vennootschappen", () => {
  it("laat de hoofdbeheerder alles zien", () => {
    expect(magVennootschapZien(HOOFD, VENN_A)).toBe(true);
    expect(magVennootschapZien(HOOFD, VENN_B)).toBe(true);
    expect(zichtbareVennootschappen(HOOFD)).toBeNull();
  });

  it("beperkt de anderen tot de eigen vennootschap", () => {
    expect(magVennootschapZien(BEHEERDER_A, VENN_A)).toBe(true);
    expect(magVennootschapZien(BEHEERDER_A, VENN_B)).toBe(false);
    expect(magVennootschapZien(KIJKER_B, VENN_A)).toBe(false);
    expect(zichtbareVennootschappen(KIJKER_A)).toEqual([VENN_A]);
  });

  it("geeft niemand toegang als er geen vennootschap gekoppeld is", () => {
    const zwevend = gebruiker({ vennootschap_id: null });
    expect(zichtbareVennootschappen(zwevend)).toEqual([]);
    expect(magVennootschapZien(zwevend, VENN_A)).toBe(false);
  });
});

describe("wat elke rol mag", () => {
  it("laat enkel de hoofdbeheerder aan instellingen en rapporten", () => {
    expect(magInstellingenBeheren(HOOFD)).toBe(true);
    expect(magInstellingenBeheren(BEHEERDER_A)).toBe(false);
    expect(magRapportenMaken(HOOFD)).toBe(true);
    expect(magRapportenMaken(BEHEERDER_A)).toBe(false);
    expect(magRapportenMaken(KIJKER_A)).toBe(false);
  });

  it("laat beide beheerdersrollen gebruikers beheren, maar geen kijker", () => {
    expect(magGebruikersBeheren(HOOFD)).toBe(true);
    expect(magGebruikersBeheren(BEHEERDER_A)).toBe(true);
    expect(magGebruikersBeheren(KIJKER_A)).toBe(false);
  });

  it("laat een vennootschapsbeheerder geen hoofdbeheerder aanstellen", () => {
    expect(toewijsbareRollen(HOOFD)).toContain("hoofdbeheerder");
    expect(toewijsbareRollen(BEHEERDER_A)).toEqual(["vennootschapsbeheerder", "kijker"]);
    expect(toewijsbareRollen(KIJKER_A)).toEqual([]);
  });
});

describe("uitnodigen", () => {
  it("laat de hoofdbeheerder iemand over alle vennootschappen heen aanstellen", () => {
    const beslissing = magUitnodigen(HOOFD, {
      email: "nieuw@voorbeeld.be",
      rol: "hoofdbeheerder",
      vennootschap_id: null,
    });
    expect(beslissing.toegestaan).toBe(true);
  });

  it("eist een vennootschap voor wie geen hoofdbeheerder is", () => {
    const beslissing = magUitnodigen(HOOFD, {
      email: "nieuw@voorbeeld.be",
      rol: "kijker",
      vennootschap_id: null,
    });
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("Kies bij welke vennootschap");
  });

  it("laat een vennootschapsbeheerder iemand toevoegen aan de eigen vennootschap", () => {
    const beslissing = magUitnodigen(BEHEERDER_A, {
      email: "boekhouder@kantoor.be",
      rol: "kijker",
      vennootschap_id: VENN_A,
    });
    expect(beslissing.toegestaan).toBe(true);
  });

  it("houdt een vennootschapsbeheerder weg bij de andere vennootschap", () => {
    const beslissing = magUitnodigen(BEHEERDER_A, {
      email: "boekhouder@kantoor.be",
      rol: "kijker",
      vennootschap_id: VENN_B,
    });
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("eigen vennootschap");
  });

  it("belet dat een vennootschapsbeheerder iemand promoveert tot hoofdbeheerder", () => {
    const beslissing = magUitnodigen(BEHEERDER_A, {
      email: "vriend@voorbeeld.be",
      rol: "hoofdbeheerder",
      vennootschap_id: null,
    });
    expect(beslissing.toegestaan).toBe(false);
  });

  it("laat een kijker niemand uitnodigen", () => {
    const beslissing = magUitnodigen(KIJKER_A, {
      email: "vriend@voorbeeld.be",
      rol: "kijker",
      vennootschap_id: VENN_A,
    });
    expect(beslissing.toegestaan).toBe(false);
  });
});

describe("bestaande gebruikers beheren", () => {
  it("laat de hoofdbeheerder iedereen beheren", () => {
    expect(magGebruikerBeheren(HOOFD, BEHEERDER_B).toegestaan).toBe(true);
    expect(magGebruikerBeheren(HOOFD, KIJKER_B).toegestaan).toBe(true);
  });

  it("beperkt een vennootschapsbeheerder tot de eigen mensen", () => {
    expect(magGebruikerBeheren(BEHEERDER_A, KIJKER_A).toegestaan).toBe(true);
    expect(magGebruikerBeheren(BEHEERDER_A, KIJKER_B).toegestaan).toBe(false);
    expect(magGebruikerBeheren(BEHEERDER_A, HOOFD).toegestaan).toBe(false);
  });

  it("laat een vennootschapsbeheerder iemand niet naar de andere vennootschap verhuizen", () => {
    const beslissing = magGebruikerWijzigen(
      BEHEERDER_A,
      KIJKER_A,
      { rol: "kijker", vennootschap_id: VENN_B },
      2,
    );
    expect(beslissing.toegestaan).toBe(false);
  });
});

describe("bescherming van de laatste hoofdbeheerder", () => {
  it("weigert de laatste hoofdbeheerder te degraderen", () => {
    const beslissing = magGebruikerWijzigen(
      HOOFD,
      { ...HOOFD, id: "andere", email: "andere@voorbeeld.be" },
      { rol: "kijker", vennootschap_id: VENN_A },
      1,
    );
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("laatste hoofdbeheerder");
  });

  it("staat degraderen wel toe als er nog een andere is", () => {
    const beslissing = magGebruikerWijzigen(
      HOOFD,
      { ...HOOFD, id: "andere", email: "andere@voorbeeld.be" },
      { rol: "kijker", vennootschap_id: VENN_A },
      2,
    );
    expect(beslissing.toegestaan).toBe(true);
  });

  it("weigert de laatste hoofdbeheerder te verwijderen", () => {
    const doelwit = { ...HOOFD, id: "andere", email: "andere@voorbeeld.be" };
    expect(magGebruikerVerwijderen(HOOFD, doelwit, 1).toegestaan).toBe(false);
    expect(magGebruikerVerwijderen(HOOFD, doelwit, 2).toegestaan).toBe(true);
  });
});

describe("het vaste beheerdersadres uit TOEGELATEN_EMAILS", () => {
  const VAST = { ...HOOFD, vasteBeheerder: true };

  it("kan niet gedegradeerd worden via de app", () => {
    const beslissing = magGebruikerWijzigen(
      HOOFD,
      VAST,
      { rol: "kijker", vennootschap_id: VENN_A },
      5,
    );
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("TOEGELATEN_EMAILS");
  });

  it("kan niet verwijderd worden via de app", () => {
    const beslissing = magGebruikerVerwijderen(
      { ...HOOFD, id: "iemand-anders", email: "anders@voorbeeld.be" },
      VAST,
      5,
    );
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("TOEGELATEN_EMAILS");
  });
});

describe("jezelf", () => {
  it("kan je niet verwijderen", () => {
    const beslissing = magGebruikerVerwijderen(
      BEHEERDER_A,
      { ...BEHEERDER_A, vasteBeheerder: false },
      3,
    );
    expect(beslissing.toegestaan).toBe(false);
    expect(beslissing.reden).toContain("jezelf");
  });

  it("herkent jezelf ook bij een ander hoofdlettergebruik", () => {
    const beslissing = magGebruikerVerwijderen(
      BEHEERDER_A,
      { ...BEHEERDER_A, email: "Beheer-A@Voorbeeld.BE" },
      3,
    );
    expect(beslissing.toegestaan).toBe(false);
  });
});

describe("hulpfuncties", () => {
  it("herkent geldige rollen", () => {
    expect(isGeldigeRol("kijker")).toBe(true);
    expect(isGeldigeRol("beheerder")).toBe(false);
    expect(isGeldigeRol("")).toBe(false);
  });

  it("normaliseert e-mailadressen", () => {
    expect(normaliseerEmail("  Jan@MakeITSo.BE ")).toBe("jan@makeitso.be");
  });
});
