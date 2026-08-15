import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export default async function Inloggen({
  searchParams,
}: {
  searchParams: Promise<{ volgende?: string; error?: string }>;
}) {
  const sessie = await auth();
  if (sessie?.user) redirect("/");

  const { volgende, error } = await searchParams;

  return (
    <div className="inlogscherm">
      <div className="inlogkaart">
        <h1>Laadkosten</h1>
        <p className="inleiding" style={{ marginBottom: 24 }}>
          Meld je aan met het Google-account dat toegang heeft gekregen.
        </p>

        {error ? (
          <div className="melding fout">
            {error === "AccessDenied"
              ? "Dit account heeft geen toegang. Voeg het adres toe aan TOEGELATEN_EMAILS."
              : "Aanmelden is niet gelukt. Probeer het opnieuw."}
          </div>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: volgende || "/" });
          }}
        >
          <button type="submit" style={{ width: "100%" }}>
            Aanmelden met Google
          </button>
        </form>
      </div>
    </div>
  );
}
