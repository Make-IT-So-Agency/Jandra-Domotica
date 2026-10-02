import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { botMagHier, laadKoppeling, leesToegang, type Botstand, type Toegang } from "@/lib/bouw/telegram-koppeling";
import { COMMANDOS } from "@/lib/bouw/telegramregels";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Melding } from "../melding";
import {
  herinneringenHierActie,
  idToevoegenActie,
  intrekkenActie,
  koppelActie,
  ontkoppelActie,
  opnieuwKoppelenActie,
  testberichtActie,
  toelatenActie,
  vergeetAanvraagActie,
} from "./acties";

export const dynamic = "force-dynamic";

/** Stap 1 en 2: een bot maken bij BotFather, en zijn token hier plakken. */
function Koppelen({ hier }: { hier: boolean }) {
  return (
    <>
      <h2>Stap 1: maak een bot in Telegram</h2>
      <div className="kaart">
        <ol className="stappen">
          <li>
            Open Telegram en zoek <strong>@BotFather</strong>, of tik op{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
              t.me/BotFather
            </a>
            . Dat is de bot van Telegram zelf om bots te maken; hij heeft een blauw vinkje.
          </li>
          <li>
            Stuur <code>/newbot</code>.
          </li>
          <li>
            Geef een naam die iedereen mag zien, <strong>zonder straatnaam of adres</strong>, bv. <em>Jandra Bouw</em>.
          </li>
          <li>
            Geef een gebruikersnaam die op <code>bot</code> eindigt, bv. <em>jandra_bouw_bot</em>. Is ze al bezet, kies
            dan een andere.
          </li>
          <li>
            BotFather antwoordt met een <strong>token</strong>: een lange code zoals <code>123456789:AAH…</code>. Tik erop
            om het te kopiëren.
          </li>
        </ol>
        <p className="melding let-op" style={{ marginBottom: 0 }}>
          Het token is het wachtwoord van de bot. Plak het enkel hieronder: niet in een chat, een mail of een gesprek met
          Claude. Kwam het toch ergens terecht, vraag dan bij BotFather een nieuw met <code>/revoke</code> en koppel
          opnieuw.
        </p>
      </div>

      <h2>Stap 2: koppel de bot</h2>
      <form action={koppelActie} className="kaart">
        <label htmlFor="token">Token van BotFather</label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="123456789:AAH…"
          disabled={!hier}
        />
        <p className="hulp">
          De app kijkt het token na bij Telegram, zet de webhook en de commando&apos;s, en bewaart het token versleuteld in
          de databank. Het is een andere bot dan die van Opvang: dat token weigert de app.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit" disabled={!hier}>
            Koppelen
          </button>
        </div>
      </form>
    </>
  );
}

function Stand({ stand, toegang }: { stand: Botstand; toegang: Toegang }) {
  const bot = stand.bot ? `https://t.me/${stand.bot}` : null;
  const herinneringen = toegang.toegelaten.find((chat) => chat.id === toegang.chat);
  return (
    <div className="kaart">
      <p style={{ marginTop: 0 }}>
        Gekoppeld met{" "}
        {bot ? (
          <a href={bot} target="_blank" rel="noopener noreferrer">
            @{stand.bot}
          </a>
        ) : (
          "de bot"
        )}
        .
      </p>
      {stand.fout ? <p className="melding fout">{stand.fout}</p> : null}
      {stand.webhook ? (
        <ul className="weeklijst">
          <li>
            {stand.webhook.juist ? (
              <span className="label-vlag goed">berichten komen in de app toe</span>
            ) : (
              <span className="label-vlag let-op">berichten gaan naar {stand.webhook.url || "nergens"}: koppel opnieuw</span>
            )}
          </li>
          {stand.webhook.wachtend > 0 ? (
            <li>{stand.webhook.wachtend === 1 ? "1 bericht wacht" : `${stand.webhook.wachtend} berichten wachten`} bij Telegram</li>
          ) : null}
          {stand.webhook.laatsteFout ? (
            <li>
              Laatste fout{stand.webhook.laatsteFoutOp ? ` (${datumTijd(stand.webhook.laatsteFoutOp)})` : ""}:{" "}
              {stand.webhook.laatsteFout}
            </li>
          ) : null}
        </ul>
      ) : null}
      <p>
        Herinneringen gaan naar:{" "}
        {herinneringen ? (
          <strong>{herinneringen.naam}</strong>
        ) : (
          <span className="hulp">nog geen chat gekozen (zie stap 3)</span>
        )}
      </p>
      <form className="knoppenrij">
        <button type="submit" className="stil" formAction={opnieuwKoppelenActie}>
          Opnieuw koppelen
        </button>
        {herinneringen ? (
          <button type="submit" className="stil" formAction={testberichtActie}>
            Testbericht sturen
          </button>
        ) : null}
        <BevestigKnop vraag="De bot ontkoppelen? Hij stuurt dan niets meer tot je opnieuw koppelt." formAction={ontkoppelActie}>
          Ontkoppelen
        </BevestigKnop>
      </form>
    </div>
  );
}

function Toegangslijsten({ toegang, bot }: { toegang: Toegang; bot: string | null }) {
  const link = bot ? `https://t.me/${bot}` : null;
  return (
    <>
      <h2 id="toegang">Stap 3: wie de bot mag gebruiken</h2>
      <div className="kaart">
        <ol className="stappen">
          <li>
            Open{" "}
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                @{bot}
              </a>
            ) : (
              "de bot"
            )}{" "}
            in Telegram en tik op <strong>Start</strong>. Sandra doet hetzelfde op haar gsm.
          </li>
          <li>
            Maak in Telegram een groep met jullie twee, voeg de bot toe als lid
            {bot ? (
              <>
                {" "}
                (zoek op <code>@{bot}</code>)
              </>
            ) : null}
            , en typ in de groep <code>/start</code>.
          </li>
          <li>
            <Link href="/bouw/telegram#toegang">Vernieuw deze pagina</Link>: wie vroeg, staat hieronder. Laat jullie
            allebei <strong>en</strong> de groep toe: in een groep moeten de groep en elke persoon toegelaten zijn.
          </li>
          <li>
            Kies bij de groep <strong>Herinneringen hierheen</strong>. <code>/hier</code> typen in de groep doet hetzelfde.
          </li>
        </ol>
      </div>

      <h3>Wacht op toegang</h3>
      {toegang.aanvragen.length === 0 ? (
        <p className="leeg">Niemand.</p>
      ) : (
        <ul className="chatlijst">
          {toegang.aanvragen.map((aanvraag) => (
            <li key={aanvraag.id}>
              <form action={toelatenActie}>
                <input type="hidden" name="chat_id" value={aanvraag.id} />
                <span>
                  <strong>{aanvraag.naam}</strong>{" "}
                  <span className="hulp">
                    {aanvraag.soort} · {datumTijd(aanvraag.op)} · id {aanvraag.id}
                  </span>
                </span>
                <span className="knoppenrij">
                  <button type="submit">Toelaten</button>
                  {aanvraag.soort === "groep" ? (
                    <button type="submit" name="herinneringen" value="ja" className="stil">
                      Toelaten, met de herinneringen
                    </button>
                  ) : null}
                  <button type="submit" className="stil" formAction={vergeetAanvraagActie}>
                    Negeren
                  </button>
                </span>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h3>Toegelaten</h3>
      {toegang.toegelaten.length === 0 ? (
        <p className="leeg">Nog niemand.</p>
      ) : (
        <ul className="chatlijst">
          {toegang.toegelaten.map((chat) => (
            <li key={chat.id}>
              <form action={intrekkenActie}>
                <input type="hidden" name="chat_id" value={chat.id} />
                <span>
                  <strong>{chat.naam}</strong>{" "}
                  <span className="hulp">
                    {chat.soort} · id {chat.id}
                  </span>{" "}
                  {toegang.chat === chat.id ? <span className="label-vlag goed">herinneringen</span> : null}
                </span>
                <span className="knoppenrij">
                  {toegang.chat !== chat.id ? (
                    <button type="submit" className="stil" formAction={herinneringenHierActie}>
                      Herinneringen hierheen
                    </button>
                  ) : null}
                  <BevestigKnop vraag={`${chat.naam} de toegang tot de bot afnemen?`} className="stil">
                    Intrekken
                  </BevestigKnop>
                </span>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="kaart">
        <summary>Een id met de hand toevoegen</summary>
        <form action={idToevoegenActie} style={{ marginTop: 12 }}>
          <div className="veldenrij">
            <div>
              <label htmlFor="telegram_id">Telegram-id</label>
              <input id="telegram_id" name="telegram_id" inputMode="numeric" required placeholder="-100123456789" />
            </div>
            <div>
              <label htmlFor="chatnaam">Naam</label>
              <input id="chatnaam" name="naam" required maxLength={80} placeholder="Sandra" />
            </div>
            <div>
              <label htmlFor="chatsoort">Soort</label>
              <select id="chatsoort" name="soort" defaultValue="persoon">
                <option value="persoon">Persoon</option>
                <option value="groep">Groep</option>
              </select>
            </div>
          </div>
          <p className="hulp">De bot geeft het id met /id. Dat van een groep begint met een minteken.</p>
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Toelaten</button>
          </div>
        </form>
      </details>
    </>
  );
}

export default async function Telegrampagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const hier = botMagHier();
  let stand: Botstand;
  let toegang: Toegang;
  try {
    [stand, toegang] = await Promise.all([laadKoppeling(), leesToegang()]);
  } catch (fout) {
    return (
      <>
        <h1>Telegram</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }
  const gekoppeld = stand.token === "leesbaar";

  return (
    <>
      <h1>Telegram</h1>
      <p className="inleiding">
        De bot van Bouw stuurt elke ochtend naar jullie groep in Telegram wat er moet gebeuren: keuzes met een deadline,
        facturen, actiepunten, onderhoud en garanties, wat morgen begint, en op maandag de week. Het is een andere bot dan
        die van Opvang. Je koppelt hem hier, in drie stappen; enkel de bot zelf maak je in Telegram. Zonder bot werkt de
        rest van Bouw gewoon.
      </p>

      <Melding soort={soort} melding={melding} />

      {!hier ? (
        <div className="melding let-op">
          Dit is een testversie van de app. De bot werkt enkel in de gewone app: koppel en beheer hem daar.
        </div>
      ) : null}

      {stand.token === "onleesbaar" ? (
        <div className="melding let-op">
          Er staat een token, maar het is niet meer te lezen: wellicht veranderde de geheime sleutel van de app
          (AUTH_SECRET). Plak het token hieronder opnieuw.
        </div>
      ) : null}

      {gekoppeld ? (
        <>
          <h2>Stand</h2>
          <Stand stand={stand} toegang={toegang} />
          <Toegangslijsten toegang={toegang} bot={stand.bot} />
          <details className="kaart" style={{ marginTop: 16 }}>
            <summary>Een andere bot koppelen</summary>
            <Koppelen hier={hier} />
          </details>
        </>
      ) : (
        <>
          <Koppelen hier={hier} />
          {toegang.toegelaten.length > 0 || toegang.aanvragen.length > 0 ? (
            <Toegangslijsten toegang={toegang} bot={stand.bot} />
          ) : null}
        </>
      )}

      <h2>Hoe het werkt</h2>
      <details className="kaart">
        <summary>Wat de bot stuurt</summary>
        <p>Elke ochtend om half negen (in de winter half acht), naar de chat voor de herinneringen:</p>
        <ul>
          <li>een keuze waarvan de deadline nadert: 14, 7, 3 en 1 dag vooraf, op de dag zelf en de dag erna;</li>
          <li>een factuur: 3 dagen voor de vervaldag, op de dag zelf en de dag erna;</li>
          <li>een actiepunt: de dag ervoor, op de dag zelf en de dag erna;</li>
          <li>onderhoud: een week vooraf en op de dag zelf, en elke maand zolang het te laat is;</li>
          <li>een garantie die afloopt: twee maanden, een maand en een week vooraf;</li>
          <li>wat morgen begint, een mijlpaal van vandaag, en op maandag de week.</li>
        </ul>
        <p>
          Elke melding vertrekt maar één keer. Meteen, zonder te wachten op de ochtend: wat een architect of aannemer via
          zijn link instuurt, en wat een aannemer hersteld meldt.
        </p>
      </details>
      <details className="kaart">
        <summary>Commando&apos;s</summary>
        <ul>
          {COMMANDOS.map(({ commando, uitleg }) => (
            <li key={commando}>
              <code>/{commando}</code>: {uitleg}
            </li>
          ))}
        </ul>
        <p className="hulp">Typ ze met de schuine streep ervoor: gewone berichten leest de bot niet.</p>
      </details>
      <details className="kaart">
        <summary>Komt er niets aan?</summary>
        <ul>
          <li>Staat er bij Stand een fout, of gaan de berichten naar een ander adres? Tik op Opnieuw koppelen.</li>
          <li>Staan jullie allebei én de groep bij Toegelaten?</li>
          <li>Is er een chat gekozen voor de herinneringen? Stuur dan een testbericht.</li>
          <li>Werd de bot uit de groep gezet? Voeg hem opnieuw toe.</li>
          <li>Een nieuw token, na /revoke bij BotFather? Plak het bij Een andere bot koppelen.</li>
        </ul>
      </details>
    </>
  );
}
