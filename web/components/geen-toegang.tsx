export function GeenToegang({ wat, voor = "de hoofdbeheerder" }: { wat: string; voor?: string }) {
  return (
    <>
      <h1>Geen toegang</h1>
      <div className="melding let-op">
        <p>
          {wat} is voorbehouden aan {voor}.
        </p>
        <p>
          Heb je die rechten nodig? Vraag ze aan wie de app beheert. Wat je wél kan zien,
          staat in het menu.
        </p>
      </div>
    </>
  );
}
