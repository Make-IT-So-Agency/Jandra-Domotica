import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Wat een partij via haar persoonlijke link ziet. Geen zoekmachines, en geen
 * Referer: anders zou het token in de URL meereizen naar elke site of
 * opslag die de pagina opvraagt.
 */
export const metadata: Metadata = {
  title: "Ons bouwproject",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Externlayout({ children }: { children: ReactNode }) {
  return <div className="extern">{children}</div>;
}
