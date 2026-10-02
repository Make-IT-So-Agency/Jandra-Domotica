"use client";

import dynamic from "next/dynamic";

/**
 * Laadt het 3D-scherm enkel in de browser: three.js tekent met WebGL, en dat
 * bestaat niet op de server. Zo zit three.js ook enkel in de bundel van deze
 * pagina.
 */
export const DrieLader = dynamic(() => import("./drie"), {
  ssr: false,
  loading: () => (
    <div className="drie-vak">
      <p className="hulp" style={{ padding: 16 }}>
        Het huis opbouwen…
      </p>
    </div>
  ),
});
