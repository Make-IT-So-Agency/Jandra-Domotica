/**
 * Een klein stukje van de REST-API van Supabase (PostgREST), met de
 * service-role sleutel uit SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY.
 * Geen bibliotheek: fetch volstaat, en zo blijft de workflow licht.
 *
 * Een fout bevat nooit de sleutel en nooit de inhoud van een rij.
 */

function instellingen(): { url: string; sleutel: string } {
  const url = process.env.SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sleutel) throw new Error("SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt.");
  return { url: url.replace(/\/+$/, ""), sleutel };
}

export async function rest<T = unknown>(
  methode: "GET" | "POST" | "PATCH" | "DELETE",
  pad: string,
  body?: unknown,
  prefer = "return=representation",
): Promise<T> {
  const { url, sleutel } = instellingen();
  const antwoord = await fetch(`${url}/rest/v1/${pad}`, {
    method: methode,
    headers: {
      apikey: sleutel,
      Authorization: `Bearer ${sleutel}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const tekst = await antwoord.text();
  if (!antwoord.ok) {
    const [tabel] = pad.split("?");
    let reden = `HTTP ${antwoord.status}`;
    try {
      reden += `: ${(JSON.parse(tekst) as { message?: string }).message ?? ""}`;
    } catch {
      /* geen JSON */
    }
    throw new Error(`Supabase ${methode} ${tabel}: ${reden.slice(0, 200)}`);
  }
  return (tekst ? JSON.parse(tekst) : null) as T;
}

/** Waarde voor een filter in de URL: in=(...) of eq.x, veilig gecodeerd. */
export function lijst(waarden: (string | number)[]): string {
  return `(${waarden.map((w) => encodeURIComponent(typeof w === "number" ? String(w) : `"${w}"`)).join(",")})`;
}
