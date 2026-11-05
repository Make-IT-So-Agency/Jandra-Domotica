# Jandra stijlgids: look and feel uit het prototype "Eerlijk is eerlijk"

Doel: de Jandra-webapp volledig in deze stijl omzetten, zonder het prototype zelf te zien. Dit document beschrijft **enkel de stijl**, niet de inhoud of werking van de module.

Bronnen: het prototype `eerlijk-is-eerlijk.html` (versie van 5 november 2026) en de schermafbeeldingen in `schermafbeeldingen.zip`. Alle waarden hieronder komen letterlijk uit het prototype. Wat er niet in vastligt, staat onder **Open vragen** aan het einde.

---

## 1. Stack

**Het prototype gebruikt géén Tailwind, shadcn/ui, Radix, lucide-react of Framer Motion.** Het is één HTML-bestand met:

| Onderdeel | Wat het prototype gebruikt |
|---|---|
| Opmaak | Eén handgeschreven `<style>`-blok met gewone CSS en CSS-variabelen (zie §2 en Bijlage A) |
| Onderdelen | Gewone HTML-elementen met eigen CSS-klassen. Geen componentbibliotheek |
| Formulierelementen | Native `<input>`, `<textarea>`, `<select>`, `<input type="range">` en `<input type="number">` |
| Iconen | Vijf zelfgetekende inline-SVG's (zie Bijlage B). Geen iconenbibliotheek |
| Lettertypes | Google Fonts via één `<link>` |
| Animaties | Geen (zie §5) |
| Logica | Gewone JavaScript, geen framework |

Er is **geen `package.json`**, geen `tailwind.config`, geen `globals.css` en geen `components.json`. Het enige externe dat geladen wordt, is dit (letterlijk):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
```

De omzetting naar Tailwind en shadcn/ui is dus een vertaling. De aandachtspunten daarvoor staan onder Open vragen.

---

## 2. Tokens

### 2.1 CSS-variabelen, letterlijk

Het donkere thema wordt op twee manieren geactiveerd:
- automatisch via `prefers-color-scheme: dark`, tenzij `data-theme="light"` op `<html>` staat;
- expliciet via `data-theme="dark"` op `<html>`.

Er is **geen `.dark`-klasse**, zoals shadcn die gebruikt.

```css
:root{
  --bg:#eef1ee; --surface:#ffffff; --card:#fbfcfa; --fg:#1f2a26; --muted:#5d6b65; --line:#d6ddd9;
  --accent:#2f6b57; --accent-soft:#dcebe4; --jan:#2f5d8a; --jan-soft:#dde7f2; --sandra:#a24a6b; --sandra-soft:#f3e0e8;
  --warn:#8a5c0c; --warn-soft:#f6ecd6; --danger:#b3261e; --on-danger:#ffffff;
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --body:"Atkinson Hyperlegible",ui-sans-serif,system-ui,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#121816; --surface:#1a221f; --card:#202a26; --fg:#e6ece9; --muted:#9aa8a2; --line:#2e3935;
  --accent:#7cc2a6; --accent-soft:#22362f; --jan:#8ab4e0; --jan-soft:#1f2c3a; --sandra:#e29ab6; --sandra-soft:#3a2430;
  --warn:#e2b45c; --warn-soft:#3a2f1a; --danger:#e5554a; --on-danger:#ffffff; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#121816; --surface:#1a221f; --card:#202a26; --fg:#e6ece9; --muted:#9aa8a2; --line:#2e3935;
  --accent:#7cc2a6; --accent-soft:#22362f; --jan:#8ab4e0; --jan-soft:#1f2c3a; --sandra:#e29ab6; --sandra-soft:#3a2430;
  --warn:#e2b45c; --warn-soft:#3a2f1a; --danger:#e5554a; --on-danger:#ffffff; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:var(--body);font-size:16px;line-height:1.5}
```

### 2.2 Kleuren

| Rol | Token | Licht | Donker | Waar gebruikt |
|---|---|---|---|---|
| Achtergrond pagina | `--bg` | `#eef1ee` | `#121816` | `body`; ook als vulling van invoervelden en van neutrale labels |
| Vlak | `--surface` | `#ffffff` | `#1a221f` | Knoppen, panelen, dialoog, stappen, vakken |
| Kaart | `--card` | `#fbfcfa` | `#202a26` | Kaarten en kleine kaarten |
| Tekst | `--fg` | `#1f2a26` | `#e6ece9` | Hoofdtekst; ook als achtergrond van de actieve stap en van de bewaarmelding |
| Gedempte tekst | `--muted` | `#5d6b65` | `#9aa8a2` | Uitleg, kleine labels, hints |
| Lijnen | `--line` | `#d6ddd9` | `#2e3935` | Alle randen, scheidingslijnen, lege balken |
| Accent (primary) | `--accent` | `#2f6b57` | `#7cc2a6` | Primaire knop, geselecteerd bolletje, focusrand, schuifbalk, meterbalk |
| Accent zacht | `--accent-soft` | `#dcebe4` | `#22362f` | Positieve melding, standaardlabel, icoonbadge "via het spel" |
| **Goed** | `--accent` / `--accent-soft` | idem | idem | Er is geen aparte successkleur: "goed" gebruikt het accent |
| **Let op** | `--warn` | `#8a5c0c` | `#e2b45c` | Tekst of vulling voor "let op", bijvoorbeeld over de beschikbare tijd |
| Let op zacht | `--warn-soft` | `#f6ecd6` | `#3a2f1a` | Gele meldingen en bevestigingsvakken |
| **Fout / gevaar** | `--danger` | `#b3261e` | `#e5554a` | Alleen de verwijderknop en de bevestiging om te verwijderen |
| Tekst op gevaar | `--on-danger` | `#ffffff` | `#ffffff` | |
| Persoon Jan | `--jan` / `--jan-soft` | `#2f5d8a` / `#dde7f2` | `#8ab4e0` / `#1f2c3a` | Alleen om Jan aan te duiden |
| Persoon Sandra | `--sandra` / `--sandra-soft` | `#a24a6b` / `#f3e0e8` | `#e29ab6` / `#3a2430` | Alleen om Sandra aan te duiden |
| Overlay dialoog | (letterlijk) | `rgba(10,16,14,.45)` | idem | Achter de dialoog |

Tekst op een gekleurde vulling (accent, jan, sandra, warn) gebruikt `--surface` als tekstkleur: wit in licht, bijna zwart in donker.

### 2.3 Lettertypes

| Rol | Familie | Gewicht | Grootte | Regelhoogte | Overig |
|---|---|---|---|---|---|
| Paginatitel (h1) | Bricolage Grotesque | 700 | `clamp(28px, 6vw, 40px)` | 1.1 | `text-wrap: balance` |
| Tussentitel (h2) | Bricolage Grotesque | 700 | 22px | (erft 1.5) | `text-wrap: balance` |
| Sectietitel (h3) | Bricolage Grotesque | **500** | 17px | (erft) | |
| Kaarttitel | Bricolage Grotesque | 700 | 17px | 1.2 | `overflow-wrap: anywhere` |
| Groot getal | Bricolage Grotesque | 700 | 24px (paneel), 22px (schuifbalkwaarde) | 1.1 | `tabular-nums` |
| Persoonsnaam | Bricolage Grotesque | 700 | 20px (17px in paneel) | | in persoonskleur |
| Feestelijke melding | Bricolage Grotesque | 500 | 18px | | |
| Stapnaam | Bricolage Grotesque | 700 | 15px | | |
| Tekst | Atkinson Hyperlegible | 400 / 700 | **16px** | 1.5 | |
| Klein | Atkinson Hyperlegible | 400 | 14px | | uitleg, meldingen, keuzeknoppen |
| Kleiner | Atkinson Hyperlegible | 400 / 700 | 13px | | kaartomschrijving, kleine knoppen, veldlabels (700), bewaarmelding (700) |
| Mini | Atkinson Hyperlegible | 400 / 700 | 12px | | hints, veldlabeltjes, labels (700) |
| Bovenschrift | Atkinson Hyperlegible | 700 | 12px (11px op kaart) | | HOOFDLETTERS, `letter-spacing: .08em`, `--muted` |

Bricolage Grotesque wordt geladen met de as `opsz` 12–96. De browser kiest de optische maat automatisch per grootte. Cijfers die in kolommen staan, gebruiken overal `font-variant-numeric: tabular-nums`.

### 2.4 Afstanden, hoeken en schaduwen

**Afstanden.** Er is geen vaste schaal. Dit zijn de gebruikte waarden in px:

| Waar | Waarde |
|---|---|
| Zijmarge van de pagina | `max(16px, env(safe-area-inset-left/right))` |
| Boven- en ondermarge van de pagina | 24 / 80 |
| Tussen de hoofdblokken (kop, stappen, inhoud) | 22 |
| Tussen de blokken binnen een scherm | 16 |
| Tussen werkvlak en zijpaneel | 20 (smal) / 24 (vanaf 900px) |
| Kaartenraster | 12 (smal) / 14 (vanaf 700px) / 10 (tot 460px) |
| Binnenkant van een kaart | 12 × 14 (verticaal × horizontaal), tussenruimte 8 |
| Kleine kaart | 10 × 12, tussenruimte 6 |
| Panelen en vakken | 12 × 14 |
| Meldingen | 10 × 14 |
| Lege toestand | 18 rondom |
| Dialoog | 20 × 16, tussenruimte 12 |
| Rij met knoppen of labels | tussenruimte 8 (6 in kaartvoet, 4 tussen bolletjes) |

**Hoeken (radius):**

| Waarde | Waar |
|---|---|
| 999px (pil) | Labels, gesegmenteerde schakelaar, bewaarmelding |
| 50% | Ronde badges, bolletjes |
| 18px | Dialoog (op gsm alleen bovenaan) |
| 14px | Kaart |
| 12px | Kleine kaart, panelen, vakken, lege toestand |
| 10px | Knop, melding, stapknop, 2×2-keuzeraster |
| 8px | Kleine knop, invoervelden |
| 7px / 5px | Balken (14px en 10px hoog) |

**Schaduwen.** Er zijn er bewust maar twee:

| Waar | Waarde |
|---|---|
| Kaart | `box-shadow: 0 1px 0 var(--line)`, een haarlijn onder de kaart, geen echte schaduw |
| Bewaarmelding (zwevend) | `box-shadow: 0 2px 8px rgba(0,0,0,.18)` |

**Breekpunten:**

| Breedte | Wat er verandert |
|---|---|
| ≤ 460px | Kaartenraster in 2 kolommen |
| ≤ 620px | Twee naast elkaar staande kolommen schuiven onder elkaar. De dialoog schuift van onderen op (vanaf 621px staat hij gecentreerd) |
| ≥ 700px | Kaartenraster `minmax(250px, 1fr)` |
| ≥ 700px én `pointer: coarse` (tablet) | Grotere tikvlakken (zie §3) |
| ≥ 900px | Zijpaneel van 300px rechts, en stappenbalk die blijft plakken |

---

## 3. Onderdelen

Alle onderdelen zijn zelfgemaakt. De CSS hieronder is letterlijk overgenomen. Een paar regels die in het prototype samen in één mediaquery staan, zijn per onderdeel apart gezet. Het volledige stijlblok staat ongewijzigd in Bijlage A.

**Algemene toestanden.** Deze gelden voor alle onderdelen, tenzij anders vermeld:
- **Focus:** `outline: 2px solid var(--accent); outline-offset: 2px` op knoppen, invoervelden, tekstvakken en keuzelijsten.
- **Uitgeschakeld:** `opacity: .45; cursor: not-allowed`.
- **Hover:** er is **geen enkele hoverstijl** gedefinieerd (zie Open vragen).
- **Actief of geselecteerd:** via `aria-pressed="true"` en per onderdeel apart gestyled.

### 3.1 Knop

```css
button{font:inherit;cursor:pointer}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{cursor:not-allowed;opacity:.45}
.btn{border:1px solid var(--line);background:var(--surface);color:var(--fg);padding:9px 16px;border-radius:10px;font-weight:700}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.btn.ghost{background:none}
.btn.danger{background:var(--danger);border-color:var(--danger);color:var(--on-danger);display:inline-flex;align-items:center;justify-content:center;gap:6px}
.btn.icon{padding:5px 8px;min-width:34px}
.btn svg{width:16px;height:16px;flex:none;display:block}
.btn.icon{display:inline-flex;align-items:center;justify-content:center}
.btn.sm{padding:5px 10px;font-size:13px;border-radius:8px}
@media (min-width:700px) and (pointer:coarse){ .btn.icon{min-width:44px} .btn svg{width:18px;height:18px} }
@media (min-width:700px) and (pointer:coarse){ .btn{min-height:44px} .btn.sm{min-height:40px;padding:8px 12px;font-size:14px} }
```

| Variant | Uitzicht |
|---|---|
| Standaard | Wit vlak, rand in `--line`, vette tekst |
| Primair | Volle accentkleur, tekst in `--surface` |
| Ghost | Geen vulling, wel een rand |
| Gevaar | Volle rode vulling, witte tekst en icoon |
| Icoon | Alleen een icoon (16px, 18px op tablet), minstens 34px breed (44px op tablet). Altijd met `aria-label` en `title` |
| Klein | Kleinere tekst en hoek |

Knoppen hebben geen schaduw.

### 3.2 Gesegmenteerde schakelaar
Een pilvormige groep van twee of meer knoppen, gebruikt om tussen personen te wisselen.

```css
.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:var(--surface)}
.seg button{font:inherit;border:0;background:none;color:var(--fg);padding:7px 16px;border-radius:999px;cursor:pointer}
.seg button.jan[aria-pressed="true"]{background:var(--jan);color:var(--surface);font-weight:700}
.seg button.sandra[aria-pressed="true"]{background:var(--sandra);color:var(--surface);font-weight:700}
@media (min-width:700px) and (pointer:coarse){ .seg button{padding:10px 20px} }
```

### 3.3 Kaart

```css
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0;box-shadow:0 1px 0 var(--line)}
.card .dom{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.card .t{font-family:var(--display);font-weight:700;font-size:17px;line-height:1.2;overflow-wrap:anywhere}
.card .d{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.card .std{font-size:13px;border-top:1px dashed var(--line);padding-top:6px;overflow-wrap:anywhere}
.card .foot{margin-top:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.card.struck{opacity:.5}
.card.struck .t{text-decoration:line-through}
.card.add{border-style:dashed;align-items:center;justify-content:center;color:var(--muted);background:none;min-height:120px;font-weight:700}
.trow{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.trow .t{min-width:0}
```

Opbouw van boven naar onder:
1. Bovenschrift in hoofdletters (`DOMEIN · FREQUENTIE`).
2. Titelrij: titel links, rechts een ronde badge (zie §3.8).
3. Omschrijving in gedempte tekst.
4. Optioneel een regel onder een **gestippelde** scheidingslijn.
5. Voet met labels en actieknoppen, altijd onderaan de kaart (`margin-top: auto`).

Varianten:
- **Toevoegen:** een lege kaart met gestippelde rand, zonder vulling, met gecentreerde gedempte tekst "+ Kaart toevoegen".
- **Geschrapt:** halve doorzichtigheid en een doorgestreepte titel.

Actieknoppen op een kaart zijn icoonknoppen: potlood, doorhaling en een rode vuilbak die helemaal rechts staat. Bevestigen gebeurt op de kaart zelf: "**Zeker?**" met een rode knop **Ja** en een standaardknop **Nee**, rechts uitgelijnd.

### 3.4 Kleine kaart (lijstitem)
Een lijst is in dit prototype een stapel kleine kaarten. Er wordt geen `<ul>` gebruikt.

```css
.mini{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:6px}
.mini .row{display:flex;justify-content:space-between;align-items:start;gap:8px}
.mini .t{font-weight:700;overflow-wrap:anywhere;min-width:0}
.mini.moved{border-style:dashed}
.mini.jan{border-color:var(--jan)} .mini.sandra{border-color:var(--sandra)}
.col{display:grid;gap:10px;align-content:start;min-width:0}
.col > h3{display:flex;justify-content:space-between;gap:8px}
```

- De rand in een persoonskleur betekent: vast bij die persoon.
- Een gestippelde rand betekent: handmatig gewijzigd.

### 3.5 Invoerveld en tekstvak

```css
.field{display:grid;gap:4px}
.field label{font-size:13px;font-weight:700}
.field input,.field textarea,.field select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%}
.field textarea{min-height:64px;resize:vertical}
.capin{display:inline-flex;align-items:center;gap:6px}
.capin input{font:inherit;font-variant-numeric:tabular-nums;width:64px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
@media (min-width:700px) and (pointer:coarse){ .capin input{min-height:40px;width:72px} }
```

- Het label staat boven het veld, 13px vet.
- Het veld heeft de **paginakleur** (`--bg`) als vulling, niet wit. Zo valt het op tegen het witte vlak eromheen.
- Een getalveld naast tekst ("[ 34 ] u per week") is smal en inline.
- Er is geen fouttoestand gestyled.

### 3.6 Keuzelijst
Een native `<select>` met dezelfde stijl als het invoerveld (zie §3.5). Het pijltje is dat van de browser, en `color-scheme: dark` zorgt dat het menu meekleurt.

### 3.7 Keuzeknoppen

**Raster van 2×2 knoppen.** Eén keuze uit vier.

```css
.claim{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.claim button{border:0;background:var(--surface);color:var(--fg);padding:9px 4px;font-size:14px;border-top:1px solid var(--line);border-left:1px solid var(--line)}
.claim button:nth-child(-n+2){border-top:0}
.claim button:nth-child(odd){border-left:0}
.claim button[aria-pressed="true"][data-v="wil"]{background:var(--accent);color:var(--surface);font-weight:700}
.claim button[aria-pressed="true"][data-v="mag"]{background:var(--fg);color:var(--bg);font-weight:700}
.claim button[aria-pressed="true"][data-v="niet"]{background:var(--warn-soft);color:var(--warn);font-weight:700}
.claim button[aria-pressed="true"][data-v="echtniet"]{background:var(--warn);color:var(--surface);font-weight:700}
@media (min-width:700px) and (pointer:coarse){ .claim button{padding:12px 4px} }
```

De vulling van de geselecteerde knop verschilt per betekenis:

| Keuze | Vulling |
|---|---|
| Positief | Accent |
| Neutraal | Tekstkleur (omgekeerd) |
| Licht negatief | Zacht geel |
| Sterk negatief | Volle warn-kleur |

**Schaal van 1 tot 5 met bolletjes.**

```css
.dots{display:flex;gap:4px}
.dots button{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:13px;font-variant-numeric:tabular-nums;padding:0}
.dots button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface);font-weight:700}
.sr{display:grid;gap:4px} .sr .k{font-size:12px;color:var(--muted)}
@media (min-width:700px) and (pointer:coarse){ .dots{gap:6px} .dots button{width:40px;height:40px;font-size:15px} }
```

**Schuifbalk.** Een native range-element in de accentkleur, met de waarde in groot display-cijfer ernaast.

```css
.bid{display:flex;align-items:center;gap:8px}
.bid input[type=range]{flex:1;min-width:0;height:36px;accent-color:var(--accent)}
.bid output{font-family:var(--display);font-weight:700;font-size:22px;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
```

### 3.8 Badge en label

**Label (pil).**

```css
.chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--accent-soft);color:var(--fg);white-space:nowrap}
.chip.jan{background:var(--jan-soft);color:var(--jan)} .chip.sandra{background:var(--sandra-soft);color:var(--sandra)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.chip.plain{background:var(--bg);color:var(--muted)}
```

| Variant | Gebruik |
|---|---|
| Standaard (zacht groen) | Positief nieuws |
| `plain` | Neutrale info, zoals uren of status "nog niet" |
| `jan` / `sandra` | Iets dat bij die persoon hoort |
| `warn` | Let op |

**Ronde badge van 28px.**

```css
.badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-family:var(--display);font-weight:700;font-size:14px;flex:none}
.badge.jan{background:var(--jan);color:var(--surface)} .badge.sandra{background:var(--sandra);color:var(--surface)}
.badge.spel{background:var(--accent-soft);color:var(--accent)}
.badge svg{width:16px;height:16px;display:block}
```

- Een **initiaal** (J of S) op een volle persoonskleur, of een **icoon** op zacht groen.
- Altijd met `role="img"`, `aria-label` en `title`.


### 3.9 Melding

```css
.note{background:var(--warn-soft);border-radius:10px;padding:10px 14px;font-size:14px}
.ok{background:var(--accent-soft);border-radius:10px;padding:10px 14px;font-size:14px}
.cheer{font-family:var(--display);font-weight:500;font-size:18px}
.saved{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:15;font-size:13px;font-weight:700;color:var(--bg);background:var(--fg);border-radius:999px;padding:6px 14px;max-width:calc(100% - 32px);text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.18)}
.saved:empty{display:none}
```

| Soort | Uitzicht |
|---|---|
| Let op / uitleg (`.note`) | Zacht gele vulling, geen rand, geen icoon |
| Goed (`.ok`) | Zacht groene vulling. Met `.cheer` erbij wordt de tekst groter in de displayletter, voor feestelijke momenten |
| Fout | Bestaat niet als aparte melding. Foutteksten gaan naar de zwevende bewaarmelding |
| Zwevende melding ("toast") | Pil onderaan in het midden, omgekeerde kleuren (`--fg` als achtergrond), 13px vet. Ze verschijnt en verdwijnt zonder animatie, en is verborgen zolang ze leeg is |

### 3.10 Dialoog

```css
.sheet{position:fixed;inset:0;background:rgba(10,16,14,.45);display:flex;align-items:flex-end;justify-content:center;z-index:20;padding-left:max(0px,env(safe-area-inset-left,0px));padding-right:max(0px,env(safe-area-inset-right,0px))}
.sheet form{background:var(--surface);color:var(--fg);width:100%;max-width:560px;border-radius:18px 18px 0 0;padding:20px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:grid;gap:12px;max-height:90vh;overflow:auto}
@media (min-width:620px){.sheet{align-items:center}.sheet form{border-radius:18px}}
```

- **Op gsm:** een paneel dat aan de onderkant vastzit, met alleen bovenaan ronde hoeken.
- **Vanaf 620px:** gecentreerd, maximaal 560px breed, met ronde hoeken rondom.
- **Opbouw:** titel (h2), velden onder elkaar, en onderaan de knoppen **Bewaren** (primair) en **Annuleren** (ghost), links uitgelijnd.
- **Sluiten:** met Escape of een klik op de overlay.
- Er staat geen sluitknop in de hoek.

### 3.11 Lege toestand en laden

```css
.empty{color:var(--muted);background:var(--surface);border:1px dashed var(--line);border-radius:12px;padding:18px}
```

- **Lege toestand:** een wit vak met **gestippelde** rand en gedempte tekst die zegt wat er komt en wat je kunt doen.
- **Laden:** hetzelfde vak met een tekst als "… wordt geladen". Er is geen spinner en geen skeleton.

### 3.12 Panelen, balken en meters

```css
.balance{display:grid;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.capbox{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.budget{display:grid;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.budget .nums{display:flex;justify-content:space-between;font-weight:700;font-variant-numeric:tabular-nums}
.scale{display:flex;gap:4px;align-items:stretch;height:14px;border-radius:7px;overflow:hidden;background:var(--line)}
.scale i{display:block}
.scale .j{background:var(--jan)} .scale .s{background:var(--sandra)}
.meter{height:10px;border-radius:5px;background:var(--line);overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent)}
.bal{display:grid;gap:6px}
.bal .nums{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-weight:700}
.pcols{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;border-top:1px solid var(--line);padding-top:12px}
.pcol{align-content:start;min-width:0}
.pcol > *{min-width:0;overflow-wrap:anywhere}
.pcol .big{font-family:var(--display);font-weight:700;font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums}
.who{font-family:var(--display);font-weight:700;font-size:20px}
.who.jan{color:var(--jan)} .who.sandra{color:var(--sandra)}
```

- Een **paneel** is een wit vlak met een rand van 1px en een hoek van 12px, zonder schaduw.
- Een **balk** is een afgeronde strook in `--line` die gevuld wordt in een persoonskleur of de accentkleur.
- Bij een **overschrijding** worden de vulling van de balk en het grote getal `--warn` (amber), niet rood.

### 3.13 Tabel en tabs
- **Tabel:** komt niet voor in het prototype.
- **Tabs:** die zijn er niet als apart onderdeel. De stappenbalk (§4) doet dienst als tabs of stappenteller.

---

## 4. Navigatie en layout

**Paginaopbouw.** Van boven naar onder, in één kolom van maximaal **1200px** breed, gecentreerd:

```css
.wrap{max-width:1200px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 80px;display:grid;gap:22px}
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:12px}
.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
h1{font-family:var(--display);font-weight:700;font-size:clamp(28px,6vw,40px);line-height:1.1;margin:0;text-wrap:balance}
h2{font-family:var(--display);font-weight:700;font-size:22px;margin:0;text-wrap:balance}
h3{font-family:var(--display);font-weight:500;font-size:17px;margin:0}
.intro{display:grid;gap:6px;max-width:64ch}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
```

1. **Paginakop:** links een klein bovenschrift in hoofdletters (bv. "JANDRA · EERLIJK IS EERLIJK") met daaronder de grote titel (h1). Rechts, onderaan uitgelijnd, de bediening, zoals een gesegmenteerde schakelaar met een eigen bovenschrift ervoor. Op gsm schuift de bediening onder de titel.
2. **Stappenbalk:** een horizontale rij gelijkwaardige knoppen (zie hieronder).
3. **Inhoud van het scherm:**
   - Een intro met een tussentitel (h2) en uitleg in gedempte tekst, maximaal **64 tekens** breed.
   - Daarna de blokken met 16px tussenruimte.
   - Onderaan een kleine ghost-knop voor een zeldzame actie, gescheiden door een lijn bovenaan (`border-top: 1px solid var(--line)`, 16px erboven).

**Stappenbalk** (de navigatie binnen een module):

```css
.steps{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px}
.steps button{flex:1 0 auto;border:0;background:var(--surface);color:var(--muted);padding:10px 12px;border-radius:10px;text-align:left;display:grid;gap:0;min-width:104px}
.steps button b{font-family:var(--display);font-size:15px;color:inherit}
.steps button span{font-size:12px}
.steps button.done{color:var(--fg)}
.steps button.current{background:var(--fg);color:var(--bg)}
.steps button:disabled{opacity:.5}
@media (min-width:900px){ .steps{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding-block:6px} }
@media (min-width:700px) and (pointer:coarse){ .steps button{padding:12px 14px} }
```

- Elke stapknop heeft drie regels: "Stap n" (12px), de naam (15px, display, vet) en een ondertitel (12px).
- **Huidige stap:** omgekeerde kleuren (donker vlak).
- **Afgewerkte stap:** gewone tekstkleur.
- **Latere stap:** gedempt of uitgeschakeld.
- **Op gsm:** de balk scrollt horizontaal.
- **Vanaf 900px:** de balk blijft bovenaan plakken met de paginakleur als achtergrond.

**Werkvlak en zijpaneel:**

```css
.layout{display:grid;gap:20px}
.flow{display:grid;gap:16px;align-content:start;min-width:0}
.side{order:-1;min-width:0}
@media (min-width:900px){
  .layout.has-side{grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:24px}
  .side{order:0;position:sticky;top:calc(16px + env(safe-area-inset-top,0px))}
}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
@media (min-width:700px){ .grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px} }
@media (max-width:460px){.grid{grid-template-columns:1fr 1fr;gap:10px}}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:620px){.cols{grid-template-columns:1fr}}
```

| | Laptop / tablet liggend (≥ 900px) | Gsm |
|---|---|---|
| Breedte | Maximaal 1200px, gecentreerd | Volle breedte met een zijmarge van 16px |
| Zijpaneel | 300px rechts, plakt bij scrollen | Staat bóven de inhoud (`order: -1`) |
| Kaartenraster | 3 à 4 kolommen (min. 250px) | 2 kolommen |
| Twee kolommen naast elkaar | Naast elkaar | Onder elkaar (≤ 620px) |
| Stappenbalk | Plakt bovenaan | Scrollt horizontaal en plakt niet |
| Dialoog | Gecentreerd | Paneel dat aan de onderkant vastzit |

Er is **geen navigatie op app-niveau** in het prototype: geen zijbalk, geen bovenbalk met menu, geen tabbalk onderaan (zie Open vragen).

---

## 5. Beweging

**Het prototype heeft geen overgangen of animaties.**

- Knoppen, kaarten en meldingen veranderen meteen van toestand.
- De dialoog en de zwevende melding verschijnen zonder fade of slide.
- Bij het wisselen van stap springt de pagina zonder animatie naar boven (`window.scrollTo(0,0)`).
- De bevestiging bij "Alles resetten" scrollt in beeld met `scrollIntoView({block:"center"})`, ook zonder vloeiende animatie.

Er staat één regel in de CSS die nergens meer gebruikt wordt:
```css
@media (prefers-reduced-motion:no-preference){.card{transition:transform .12s ease}.card.pick:hover{transform:translateY(-2px)}}
```
Die toont wel de bedoeling: een korte, subtiele beweging (120 ms, `ease`, 2px omhoog), en alleen als de gebruiker beweging niet heeft uitgeschakeld.

---

## 6. Schermafbeeldingen

Alles zit in `schermafbeeldingen.zip`, gemaakt met de echte lettertypes en met voorbeeldgegevens.
- **Laptop:** 1280 × 800, scherpte 2×.
- **Gsm:** iPhone 13, 390 × 844.

| # | Scherm | Toont vooral |
|---|---|---|
| 1 | `1-lijst-*` | Kaartenraster, kaartopbouw, ronde badges, icoonknoppen, rode verwijderknop, toevoegkaart, labels, geschrapte kaart |
| 2 | `2-inschatten-*` | Invoervak, 2×2-keuzeraster, bolletjes, zijpaneel met uitleg |
| 3 | `3-voorstel-*` | Twee kolommen met kleine kaarten, labels per persoon, positieve melding, zijpaneel met balken en grote getallen |
| 4 | `4-dialoog-*` | Dialoog met invoervelden, tekstvakken en keuzelijsten over een overlay |

Per scherm zijn er vier bestanden: `-licht-laptop`, `-donker-laptop`, `-licht-gsm` en `-donker-gsm`. De twee overzichtsbladen `overzicht-laptop.png` en `overzicht-gsm.png` tonen alles samen.

---

## 7. Bewust zo

Het eerste deel van deze lijst zijn keuzes die Jan expliciet maakte tijdens het ontwerp. Het tweede deel zijn bewuste keuzes uit het ontwerp zelf.

**Expliciet gevraagd door Jan:**
1. **Icoonknoppen zonder tekst op kaarten**: potlood, doorhaling en vuilbak. Ze hebben wel een tooltip en een aria-label. Zet er geen tekst bij.
2. **Verwijderen is een volle rode knop met een vuilbak, rechts uitgelijnd.** Rood komt nergens anders voor.
3. **Bevestigen gebeurt op de kaart zelf, kort:** "Zeker?" met Ja of Nee. Geen modale dialoog en geen lange uitleg.
4. **Ronde badges rechts naast de titel**: een initiaal voor een persoon en een icoon voor de andere toestand, in plaats van een tekstlabel.
5. **Geen groepering met tussentitels** in een kaartenraster. Het domein staat enkel als klein bovenschrift op de kaart.
6. **Zijpaneel in rijen:** eerst een rij over de volle breedte, daarna twee kolommen naast elkaar, één per persoon.
7. **Tablet eerst:** tikvlakken van minstens 40 à 44px op aanraakschermen vanaf 700px breed.
8. **Positieve toon:** geen teksten die conflict suggereren. Een overschrijding is amber, nooit rood.

**Uit het ontwerp:**
9. **Eén accentkleur**: een diep groen voor primaire acties, selectie, focus en positieve meldingen. Er is geen aparte successkleur.
10. **Persoonskleuren alleen voor identiteit**: blauw voor Jan en roze voor Sandra, nooit voor acties of status.
11. **Bijna geen schaduwen**: kaarten hebben enkel een haarlijn van 1px onderaan. Diepte komt van drie vlakniveaus: pagina (lichtgrijs-groen), kaart (gebroken wit) en vlak (wit).
12. **Neutrale kleuren met een groene zweem**, geen zuiver grijs, zowel in licht als in donker.
13. **Invoervelden hebben de paginakleur als vulling**, niet wit.
14. **Twee lettertypes met elk een eigen rol**: Bricolage Grotesque alleen voor titels, namen en grote getallen, en Atkinson Hyperlegible voor alle tekst, gekozen voor leesbaarheid.
15. **Bovenschriften in kleine hoofdletters** met `letter-spacing: .08em`.
16. **Gestippelde randen hebben een betekenis**: lege toestand, toevoegkaart, gewijzigd item, scheidingslijn naar een aanvulling. Gebruik ze niet als versiering.
17. **Hoofdtekst 16px**, niet 14px.
18. **Uitleg is maximaal 64 tekens breed**, ook op een breed scherm.
19. **Tekst op gekleurde vlakken gebruikt `--surface`**, zodat hij in donker modus donker wordt in plaats van wit.
20. **Geen animaties** (zie §5 en Open vragen).

---

## Open vragen

Deze punten liggen niet vast in het prototype. Beslis ze bij de omzetting.

1. **Hoverstijlen:** er zijn er geen, voor knoppen, kaarten, stappen of keuzeknoppen. Op laptop zal dat opvallen. Welke hover wil je?
2. **Donker modus:** het prototype volgt de systeeminstelling, met een attribuut `data-theme` om dat te overschrijven. shadcn werkt met een klasse `.dark`. Komt er een schakelaar in de app, en wat is de standaard?
3. **Namen van tokens in shadcn:** het prototype noemt de hoofdkleur `--accent`. In shadcn heet dat `--primary`, en betekent `--accent` iets anders (hover-achtergrond). Hoe wil je de prototypekleuren verdelen over de shadcn-tokens (`--background`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`)? Het prototype heeft geen tegenhanger voor `--secondary` en `--popover`, en geen aparte `-foreground`-kleuren behalve `--on-danger`.
4. **Hoeken:** shadcn werkt met één `--radius`, het prototype met 8, 10, 12, 14 en 18px. Welke basiswaarde en welke afgeleiden?
5. **Afstanden en lettergroottes:** er is geen vaste schaal, de waarden staan in §2. Wil je ze afronden naar de standaardschaal van Tailwind (bv. 22px wordt 24px, 14px wordt 3.5)?
6. **Successkleur:** "goed" gebruikt nu het accent. Wil je een aparte successkleur?
7. **Fouten:** er is geen foutstijl voor invoervelden en geen foutmelding in een kader. Hoe moeten fouten eruitzien?
8. **Iconen:** het prototype heeft vijf zelfgetekende SVG's in dezelfde stijl als lucide (lijndikte 2, ronde uiteinden, raster van 24). Mogen die vervangen worden door lucide-react, en welke iconen dan?
9. **Navigatie op app-niveau:** het prototype is één module zonder app-menu. Hoe ziet de hoofdnavigatie van Jandra eruit (zijbalk, bovenbalk, tabbalk onderaan op gsm)?
10. **Dialoog:** op gsm is het een paneel van onderen, vanaf 620px een gecentreerde dialoog. In shadcn zijn dat twee onderdelen (Drawer en Dialog). Wil je dat gedrag behouden?
11. **Keuzelijst, schuifbalk en getalveld zijn native.** Wil je ze vervangen door shadcn-onderdelen (Select, Slider), of native houden?
12. **Tabel, tabs, laden (spinner of skeleton):** dat komt niet voor in het prototype. Wil je daar een stijl voor?
13. **Animaties:** het prototype heeft er geen. Blijft dat zo, of wil je subtiele overgangen in de geest van §5 (120 ms, enkel als de gebruiker beweging niet heeft uitgeschakeld)?
14. **Gsm-details:**
    - Het kaartenraster staat op gsm in twee smalle kolommen, waardoor lange titels over meerdere regels lopen.
    - Het vak "Mijn beschikbare tijd" breekt op gsm onhandig af (zie `2-inschatten-*-gsm`).

    Bewust zo, of aanpassen?
15. **Persoonskleuren in de rest van de app:** gelden blauw voor Jan en roze voor Sandra overal in Jandra?
16. **Maximale breedte van 1200px:** geldt die voor alle pagina's van de app?

---

## Zo omgezet in de app

Keuzes bij de omzetting van Jandra naar deze stijl (november 2026). Ze
beantwoorden de open vragen hierboven waar dat voor de bestaande app nodig was.

- **Geen bibliotheek.** Het prototype is gewone CSS met tokens, net als de
  app. De app blijft daarom eigen CSS, zonder Tailwind of shadcn/ui: zo gaat
  een volgend prototype er rechtstreeks in. De tokens staan bovenaan
  `web/app/globals.css`, met Nederlandse namen: `--pagina` (bg), `--vlak`
  (surface), `--kaart` (card), `--tekst`, `--zacht` (muted), `--lijn`,
  `--accent`, `--accent-zacht`, `--let-op`, `--let-op-zacht`, `--fout`,
  `--fout-zacht`, `--op-fout`, `--jan`, `--sandra` en hun `-zacht`.
- **Lettertypes** via `next/font` (vraagt niets aan Google bij het bezoek).
- **Donker** volgt het toestel, met `data-theme` op `<html>` om dat te
  overschrijven, zoals in het prototype. Er is nog geen schakelaar.
- **Hover** (vraag 1): een gewone knop wordt iets donkerder, een stille knop
  krijgt een donkerdere rand, een link in het menu krijgt de paginakleur.
  Kaarten en tabs bewegen niet.
- **Goed** (vraag 6) gebruikt het accent; `--goed` is een alias.
- **Fouten** (vraag 7): een melding in `--fout-zacht`, met de eerste regel in
  `--fout` en vet. Rood blijft verder enkel voor verwijderen.
- **Iconen** (vraag 8): eigen inline-SVG's in dezelfde stijl, geen bibliotheek.
- **Navigatie** (vraag 9): een modulebalk links met een paneel ernaast; op
  gsm een tabbalk onderaan. De huidige pagina staat in omgekeerde kleuren,
  zoals de huidige stap.
- **Tabs** (vraag 12) volgen de stappenbalk: gedempt op een wit vlak, de
  actieve tab in omgekeerde kleuren. **Tabellen** krijgen een wit vlak met
  een rand van 1px, kopjes als bovenschrift; op gsm wordt elke rij een kaart.
- **Animaties** (vraag 13): geen, behalve het menu dat op gsm openschuift
  (niet als beweging uitgeschakeld is).
- **Persoonskleuren** (vraag 15) staan als tokens klaar voor de hele app,
  enkel om Jan en Sandra aan te duiden.
- **Breedte** (vraag 16): 1200px voor alle pagina's.
- **Knoppen** in de bestaande app: een knop zonder klasse is primair, `stil`
  is de standaardknop van het prototype, `gevaar` is de volle rode knop,
  `klein` is de kleine knop.
- **Wat bleef**: de tekenkleuren van de plannen en het 3D-beeld (punten,
  leidingen, ruimtes, materialen). Die hebben een eigen betekenis op het plan.

## Bijlage A: volledig stijlblok uit het prototype (letterlijk)

```css
/* Layout: stappenbalk bovenaan, daaronder één fase tegelijk; kaarten als speelkaarten in een raster dat op gsm naar twee kolommen zakt */
:root{
  --bg:#eef1ee; --surface:#ffffff; --card:#fbfcfa; --fg:#1f2a26; --muted:#5d6b65; --line:#d6ddd9;
  --accent:#2f6b57; --accent-soft:#dcebe4; --jan:#2f5d8a; --jan-soft:#dde7f2; --sandra:#a24a6b; --sandra-soft:#f3e0e8;
  --warn:#8a5c0c; --warn-soft:#f6ecd6; --danger:#b3261e; --on-danger:#ffffff;
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --body:"Atkinson Hyperlegible",ui-sans-serif,system-ui,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#121816; --surface:#1a221f; --card:#202a26; --fg:#e6ece9; --muted:#9aa8a2; --line:#2e3935;
  --accent:#7cc2a6; --accent-soft:#22362f; --jan:#8ab4e0; --jan-soft:#1f2c3a; --sandra:#e29ab6; --sandra-soft:#3a2430;
  --warn:#e2b45c; --warn-soft:#3a2f1a; --danger:#e5554a; --on-danger:#ffffff; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#121816; --surface:#1a221f; --card:#202a26; --fg:#e6ece9; --muted:#9aa8a2; --line:#2e3935;
  --accent:#7cc2a6; --accent-soft:#22362f; --jan:#8ab4e0; --jan-soft:#1f2c3a; --sandra:#e29ab6; --sandra-soft:#3a2430;
  --warn:#e2b45c; --warn-soft:#3a2f1a; --danger:#e5554a; --on-danger:#ffffff; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:var(--body);font-size:16px;line-height:1.5}
.wrap{max-width:1200px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 80px;display:grid;gap:22px}
h1{font-family:var(--display);font-weight:700;font-size:clamp(28px,6vw,40px);line-height:1.1;margin:0;text-wrap:balance}
h2{font-family:var(--display);font-weight:700;font-size:22px;margin:0;text-wrap:balance}
h3{font-family:var(--display);font-weight:500;font-size:17px;margin:0}
p{margin:0}
.muted{color:var(--muted)} .small{font-size:14px}
.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:12px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:var(--surface)}
.seg button{font:inherit;border:0;background:none;color:var(--fg);padding:7px 16px;border-radius:999px;cursor:pointer}
.seg button.jan[aria-pressed="true"]{background:var(--jan);color:var(--surface);font-weight:700}
.seg button.sandra[aria-pressed="true"]{background:var(--sandra);color:var(--surface);font-weight:700}
button{font:inherit;cursor:pointer}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{cursor:not-allowed;opacity:.45}
.btn{border:1px solid var(--line);background:var(--surface);color:var(--fg);padding:9px 16px;border-radius:10px;font-weight:700}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.btn.ghost{background:none}
.btn.danger{background:var(--danger);border-color:var(--danger);color:var(--on-danger);display:inline-flex;align-items:center;justify-content:center;gap:6px}
.btn.icon{padding:5px 8px;min-width:34px}
.btn svg{width:16px;height:16px;flex:none;display:block}
.btn.icon{display:inline-flex;align-items:center;justify-content:center}
.trow{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.trow .t{min-width:0}
.badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-family:var(--display);font-weight:700;font-size:14px;flex:none}
.badge.jan{background:var(--jan);color:var(--surface)} .badge.sandra{background:var(--sandra);color:var(--surface)}
.badge.spel{background:var(--accent-soft);color:var(--accent)}
.badge svg{width:16px;height:16px;display:block}
@media (min-width:700px) and (pointer:coarse){ .btn.icon{min-width:44px} .btn svg{width:18px;height:18px} }
.btn.sm{padding:5px 10px;font-size:13px;border-radius:8px}
.steps{display:flex;gap:4px;overflow-x:auto;padding-bottom:2px}
.steps button{flex:1 0 auto;border:0;background:var(--surface);color:var(--muted);padding:10px 12px;border-radius:10px;text-align:left;display:grid;gap:0;min-width:104px}
.steps button b{font-family:var(--display);font-size:15px;color:inherit}
.steps button span{font-size:12px}
.steps button.done{color:var(--fg)}
.steps button.current{background:var(--fg);color:var(--bg)}
.steps button:disabled{opacity:.5}
.steps button.later{opacity:.7;border:1px dashed var(--line)}
.preview [data-act]:not(.pvctl), .preview input, .preview .dots button{pointer-events:none;opacity:.55}
.pvbar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:var(--warn-soft);border-radius:10px;padding:10px 14px;font-size:14px}
.panel{display:grid;gap:16px}
.intro{display:grid;gap:6px;max-width:64ch}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.note{background:var(--warn-soft);border-radius:10px;padding:10px 14px;font-size:14px}
.ok{background:var(--accent-soft);border-radius:10px;padding:10px 14px;font-size:14px}
.domain{display:grid;gap:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
/* Tablet: werkvlak links, weegschaal als vast zijpaneel rechts */
.layout{display:grid;gap:20px}
.flow{display:grid;gap:16px;align-content:start;min-width:0}
.side{order:-1;min-width:0}
@media (min-width:900px){
  .layout.has-side{grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:24px}
  .side{order:0;position:sticky;top:calc(16px + env(safe-area-inset-top,0px))}
  .steps{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding-block:6px}
}
@media (min-width:700px){ .grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px} }
/* Vingers op een tablet: grotere tikvlakken */
@media (min-width:700px) and (pointer:coarse){
  .dots{gap:6px}
  .dots button{width:40px;height:40px;font-size:15px}
  .btn{min-height:44px}
  .btn.sm{min-height:40px;padding:8px 12px;font-size:14px}
  .seg button{padding:10px 20px}
  .steps button{padding:12px 14px}
  .capin input{min-height:40px;width:72px}
}
@media (max-width:460px){.grid{grid-template-columns:1fr 1fr;gap:10px}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0;box-shadow:0 1px 0 var(--line)}
.card .dom{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.card .t{font-family:var(--display);font-weight:700;font-size:17px;line-height:1.2;overflow-wrap:anywhere}
.card .d{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.card .std{font-size:13px;border-top:1px dashed var(--line);padding-top:6px;overflow-wrap:anywhere}
.card .foot{margin-top:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.card.struck{opacity:.5}
.card.struck .t{text-decoration:line-through}
.card.mine-jan{border-color:var(--jan)} .card.mine-sandra{border-color:var(--sandra)}
.card.add{border-style:dashed;align-items:center;justify-content:center;color:var(--muted);background:none;min-height:120px;font-weight:700}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--accent-soft);color:var(--fg);white-space:nowrap}
.chip.jan{background:var(--jan-soft);color:var(--jan)} .chip.sandra{background:var(--sandra-soft);color:var(--sandra)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.chip.plain{background:var(--bg);color:var(--muted)}
.dots{display:flex;gap:4px}
.dots button{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:13px;font-variant-numeric:tabular-nums;padding:0}
.dots button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface);font-weight:700}
.sr{display:grid;gap:4px} .sr .k{font-size:12px;color:var(--muted)}
.scale{display:flex;gap:4px;align-items:stretch;height:14px;border-radius:7px;overflow:hidden;background:var(--line)}
.scale i{display:block}
.scale .j{background:var(--jan)} .scale .s{background:var(--sandra)}
.balance{display:grid;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.capin{display:inline-flex;align-items:center;gap:6px}
.capin input{font:inherit;font-variant-numeric:tabular-nums;width:64px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
.bal{display:grid;gap:6px}
.bal .nums{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-weight:700}
.turn{font-family:var(--display);font-size:20px;font-weight:700}
.turn.jan{color:var(--jan)} .turn.sandra{color:var(--sandra)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:620px){.cols{grid-template-columns:1fr}}
.col{display:grid;gap:10px;align-content:start;min-width:0}
.col h3 b{font-variant-numeric:tabular-nums}
.empty{color:var(--muted);background:var(--surface);border:1px dashed var(--line);border-radius:12px;padding:18px}
.log{font-size:13px;color:var(--muted);display:grid;gap:2px}
.sheet{position:fixed;inset:0;background:rgba(10,16,14,.45);display:flex;align-items:flex-end;justify-content:center;z-index:20;padding-left:max(0px,env(safe-area-inset-left,0px));padding-right:max(0px,env(safe-area-inset-right,0px))}
.sheet form{background:var(--surface);color:var(--fg);width:100%;max-width:560px;border-radius:18px 18px 0 0;padding:20px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:grid;gap:12px;max-height:90vh;overflow:auto}
@media (min-width:620px){.sheet{align-items:center}.sheet form{border-radius:18px}}
.field{display:grid;gap:4px}
.field label{font-size:13px;font-weight:700}
.field input,.field textarea,.field select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%}
.field textarea{min-height:64px;resize:vertical}
.saved{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:15;font-size:13px;font-weight:700;color:var(--bg);background:var(--fg);border-radius:999px;padding:6px 14px;max-width:calc(100% - 32px);text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.18)}
.saved:empty{display:none}
@media (prefers-reduced-motion:no-preference){.card{transition:transform .12s ease}.card.pick:hover{transform:translateY(-2px)}}
.claim{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.claim button{border:0;background:var(--surface);color:var(--fg);padding:9px 4px;font-size:14px;border-top:1px solid var(--line);border-left:1px solid var(--line)}
.claim button:nth-child(-n+2){border-top:0}
.claim button:nth-child(odd){border-left:0}
.claim button[aria-pressed="true"][data-v="wil"]{background:var(--accent);color:var(--surface);font-weight:700}
.claim button[aria-pressed="true"][data-v="mag"]{background:var(--fg);color:var(--bg);font-weight:700}
.claim button[aria-pressed="true"][data-v="niet"]{background:var(--warn-soft);color:var(--warn);font-weight:700}
.claim button[aria-pressed="true"][data-v="echtniet"]{background:var(--warn);color:var(--surface);font-weight:700}
.hint{font-size:12px;color:var(--muted)}
.budget{display:grid;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.budget .nums{display:flex;justify-content:space-between;font-weight:700;font-variant-numeric:tabular-nums}
.meter{height:10px;border-radius:5px;background:var(--line);overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent)}
.bid{display:flex;align-items:center;gap:8px}
.bid input[type=range]{flex:1;min-width:0;height:36px;accent-color:var(--accent)}
.bid output{font-family:var(--display);font-weight:700;font-size:22px;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.mini{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:6px}
.mini .row{display:flex;justify-content:space-between;align-items:start;gap:8px}
.mini .t{font-weight:700;overflow-wrap:anywhere;min-width:0}
.mini.moved{border-style:dashed}
.mini.jan{border-color:var(--jan)} .mini.sandra{border-color:var(--sandra)}
.col > h3{display:flex;justify-content:space-between;gap:8px}
.pcols{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;border-top:1px solid var(--line);padding-top:12px}
.pcol{align-content:start;min-width:0}
.pcol > *{min-width:0;overflow-wrap:anywhere}
.pcol .big{font-family:var(--display);font-weight:700;font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums}
.who{font-family:var(--display);font-weight:700;font-size:20px}
.who.jan{color:var(--jan)} .who.sandra{color:var(--sandra)}
.capbox{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.cheer{font-family:var(--display);font-weight:500;font-size:18px}
@media (min-width:700px) and (pointer:coarse){ .claim button{padding:12px 4px} }
```

## Bijlage B: iconen (letterlijk, inline SVG)

Alle iconen: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, ronde uiteinden en hoeken. Ze worden getoond op 16px (18px op tablet).

```html
<!-- Vuilbak (verwijderen) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
<!-- Potlood (aanpassen) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>
<!-- Doorhaling (schrappen) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3 0 1.2.7 2 2 2.6"/><path d="M8 17.5c1 1.5 2.4 2 4 2 2.5 0 4-1.3 4-3 0-.9-.4-1.6-1.1-2.1"/></svg>
<!-- Terugdraaien (terugzetten) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>
<!-- Dobbelsteen ("via het spel") -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/></svg>
```
