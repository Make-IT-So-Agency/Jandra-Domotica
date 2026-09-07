# Uitrollen

## De lijn

```
  wijziging in de repository
        │
        ├─── CI: tests, typecontrole, build, migraties tegen een lege Postgres
        │        faalt dit, dan stopt het hier
        │
        └─── merge naar main
                  │
                  ├─── Databankmigraties      (alleen als supabase/migrations/ wijzigde)
                  └─── Productie uitrollen    (omgevingsvariabelen + deploy)
```

Die twee laatste zijn aparte workflows en lopen bij een push naar `main` naast
elkaar. Wie van de twee eerst klaar is, staat niet vast. Daar volgt de
belangrijkste regel van deze pagina uit.

## Volgorde bij een release

**Gebruikt nieuwe code iets dat de migratie aanmaakt** — een nieuwe kolom, een
nieuwe tabel — dan draait de nieuwe code mogelijk voordat dat bestaat.
Dus: eerst de migratie, dan de code.

**Verwijdert of hernoemt een migratie iets** — dan kan de oude code, die nog
even draait, naar iets grijpen dat er niet meer is.
Dus omgekeerd: eerst de release met de code die het niet meer gebruikt, daarna
pas de migratie die het weghaalt.

**Voegt een migratie alleen iets toe dat nog niemand gebruikt** — dan maakt de
volgorde niet uit. Oude code negeert een nieuwe kolom.

### Hoe je dat afdwingt

Splits de wijziging over twee commits, en start de eerste met de hand:

| Geval | Stap 1 | Stap 2 |
| --- | --- | --- |
| Iets toevoegen | **Actions → Databankmigraties → Run workflow**, bevestig met `productie` | Merge de code naar `main` |
| Iets verwijderen | Merge eerst de code die het niet meer gebruikt | Merge daarna de migratie |

De workflow **Databankmigraties** vraagt bij een handmatige start dat je
`productie` intypt. Dat is geen formaliteit: die run raakt de echte databank van
je boekhouding.

## Wat waar draait

| Workflow | Wanneer | Wat |
| --- | --- | --- |
| **CI** | elke push en pull request | tests, typecontrole, build, migraties tegen een lege Postgres |
| **Databankmigraties** | push naar `main` die `supabase/migrations/` raakt, of met de hand | `supabase db push`, met een droogloop ervoor |
| **Productie uitrollen** | push naar `main`, of met de hand | projectinstellingen en omgevingsvariabelen gelijkzetten, dan bouwen en uitrollen |
| **SQL uitvoeren** | met de hand | een bestand uit `scripts/sql/` draaien, standaard alleen lezen |
| **Validatie van de integratie** | push naar `main`, en wekelijks | hassfest en de HACS-actie |

## Terugrollen

De code: in Vercel bij **Deployments** de vorige productie-deploy openen en
*Promote to Production* kiezen. Of `git revert` en de workflow opnieuw.

De databank: niet automatisch. Een migratie terugdraaien doe je met een nieuwe
migratie die het ongedaan maakt. Dat is bewust — een automatische terugrol op
data is een goede manier om iets kwijt te raken.

## Er is geen staging

Eén omgeving, bewust. Een tweede Supabase-project kost een plaats in het gratis
niveau, en voor een app met twee vennootschappen weegt dat niet op tegen de
winst.

Wat die keuze draagt: de CI draait alle migraties tegen een lege PostgreSQL
vóór de merge, twee keer na elkaar. Een migratie die stukloopt of niet
herhaalbaar is, valt daar door de mand.

Komt er later meer op het spel te staan, dan is staging toevoegen een kwestie
van een tweede Supabase-project, een tweede GitHub-omgeving en een branch die
erop uitkomt. De workflows zijn er al op gebouwd: de omgevingsnaam staat op één
plek per workflow.
