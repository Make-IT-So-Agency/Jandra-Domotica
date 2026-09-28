import { describe, expect, it } from "vitest";

import { alsMarkdown, veiligeLink, zuiverLabel, zuiverUrl } from "../src/verslag.ts";

const O = "https://sint-katelijne-waver.i-active.be";

describe("verslag zonder persoonsgegevens", () => {
  it("haalt sessie-id's en querywaarden uit een URL", () => {
    expect(zuiverUrl(`${O}/ords/r/iactive01/burgerportaal/home-page?session=302789467438660`)).toBe(
      `${O}/ords/r/iactive01/burgerportaal/home-page?session`,
    );
    expect(zuiverUrl("https://i-active.be/ords/f?p=135:39:302789467438660:::")).toBe(
      "https://i-active.be/ords/f?p (app 135, pagina 39)",
    );
  });

  it("maskeert e-mailadressen en lange getallen in labels", () => {
    expect(zuiverLabel("Welkom jan@voorbeeld.be")).toBe("Welkom <e-mail>");
    expect(zuiverLabel("RRN 85.07.30-033.28")).toBe("RRN <getal>");
    expect(zuiverLabel("  Reserveren \n  opvang ")).toBe("Reserveren opvang");
    expect(zuiverLabel("x".repeat(100))).toHaveLength(40);
  });

  it("volgt geen link die iets zou kunnen wijzigen of buiten i-Active gaat", () => {
    expect(veiligeLink({ label: "Opvanglocaties", href: `${O}/ords/r/iactive01/burgerportaal/opvanglocaties` }, O)).toBe(true);
    expect(veiligeLink({ label: "Annuleren", href: `${O}/x` }, O)).toBe(false);
    expect(veiligeLink({ label: "Winkelmandje", href: `${O}/x` }, O)).toBe(false);
    expect(veiligeLink({ label: "Afmelden", href: `${O}/x` }, O)).toBe(false);
    expect(veiligeLink({ label: "Home", href: `${O}/ords/wwv_flow.logout?p_app_id=135` }, O)).toBe(false);
    expect(veiligeLink({ label: "Menu", href: "javascript:void(0)" }, O)).toBe(false);
    expect(veiligeLink({ label: "Oracle", href: "https://apex.oracle.com/" }, O)).toBe(false);
  });

  it("zet nooit een veldwaarde in het verslag, want die wordt niet eens gelezen", () => {
    const md = alsMarkdown({
      url: `${O}/ords/r/iactive01/burgerportaal/login?session=123456789`,
      status: 200,
      titel: "Login",
      velden: [{ tag: "input", type: "text", id: "P101_USERNAME", naam: "P101_USERNAME" }],
      knoppen: [{ id: "LOGIN_BUTTON", label: "Aanmelden" }],
      menu: [],
      kolomkoppen: ["Datum", "Voorschools"],
      aantalRegio: 3,
      aantalTabelrijen: 0,
      signalen: ["cookiemelding"],
    });
    expect(md).not.toContain("123456789");
    expect(md).toContain("| input | text | P101_USERNAME | P101_USERNAME |");
    expect(md).toContain("`LOGIN_BUTTON` Aanmelden");
    expect(md).toContain("Datum · Voorschools");
  });
});
