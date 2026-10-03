"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Een vak dat zijwaarts scrolt en bij het openen meteen op `start` pixels staat, bv. bij vandaag. */
export function Scrollvak({ start, className, children }: { start: number; className?: string; children: ReactNode }) {
  const vak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (vak.current) vak.current.scrollLeft = Math.max(0, start);
  }, [start]);

  return (
    <div ref={vak} className={className}>
      {children}
    </div>
  );
}
