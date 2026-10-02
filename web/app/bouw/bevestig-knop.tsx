"use client";

import type { ReactNode } from "react";

/**
 * Een verzendknop die eerst vraagt of het echt moet. Voor wat niet terug te
 * draaien is, zoals een plan met al zijn bestanden verwijderen.
 */
export function BevestigKnop({
  vraag,
  formAction,
  className = "gevaar",
  children,
}: {
  vraag: string;
  formAction?: (formulier: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      formNoValidate
      onClick={(gebeurtenis) => {
        if (!window.confirm(vraag)) gebeurtenis.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
