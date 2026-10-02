"use client";

import { useEffect, type RefObject } from "react";

import { knijp, verschuif, zoomRond, type Beeld, type Grenzen, type Knijpbegin, type Punt } from "@/lib/bouw/beeld";

/**
 * Verschuiven en zoomen met muis, vinger en pen, via pointer events.
 *
 * - één vinger of de muis slepen: verschuiven
 * - twee vingers: zoomen en verschuiven tegelijk
 * - muiswiel of knijpen op een trackpad: zoomen rond de muis
 * - dubbelklik: inzoomen rond de muis
 *
 * Het wiel luistert rechtstreeks op het element en niet via React: React
 * registreert wheel als passief, en dan kan preventDefault de pagina niet
 * tegenhouden.
 *
 * beeldRef is het beeld dat nu getoond wordt; zetBeeld toont een nieuw.
 */
export function useGebaren(
  vakRef: RefObject<HTMLDivElement | null>,
  beeldRef: RefObject<Beeld | null>,
  zetBeeld: (beeld: Beeld) => void,
  grenzen: Grenzen,
) {
  useEffect(() => {
    const vak = vakRef.current;
    if (!vak) return;

    const pointers = new Map<number, Punt>();
    let knijpbegin: Knijpbegin | null = null;

    const inVak = (gebeurtenis: PointerEvent | WheelEvent | MouseEvent): Punt => {
      const rand = vak.getBoundingClientRect();
      return { x: gebeurtenis.clientX - rand.left, y: gebeurtenis.clientY - rand.top };
    };

    const startKnijp = () => {
      const beeld = beeldRef.current;
      const [a, b] = [...pointers.values()];
      knijpbegin = beeld && a && b ? { beeld, a, b } : null;
    };

    // Een klik op een knop van de viewer is geen sleepbeweging.
    const opKnop = (gebeurtenis: Event) =>
      gebeurtenis.target instanceof Element && gebeurtenis.target.closest("button, a, input, select") !== null;

    const omlaag = (gebeurtenis: PointerEvent) => {
      if (gebeurtenis.pointerType === "mouse" && gebeurtenis.button !== 0) return;
      if (opKnop(gebeurtenis)) return;
      vak.setPointerCapture(gebeurtenis.pointerId);
      pointers.set(gebeurtenis.pointerId, inVak(gebeurtenis));
      if (pointers.size === 2) startKnijp();
    };

    const beweeg = (gebeurtenis: PointerEvent) => {
      const vorig = pointers.get(gebeurtenis.pointerId);
      const beeld = beeldRef.current;
      if (!vorig || !beeld) return;
      const nu = inVak(gebeurtenis);
      pointers.set(gebeurtenis.pointerId, nu);

      if (pointers.size === 1) {
        zetBeeld(verschuif(beeld, nu.x - vorig.x, nu.y - vorig.y));
      } else if (pointers.size === 2 && knijpbegin) {
        const [a, b] = [...pointers.values()];
        zetBeeld(knijp(knijpbegin, a, b, grenzen));
      }
    };

    const omhoog = (gebeurtenis: PointerEvent) => {
      if (!pointers.delete(gebeurtenis.pointerId)) return;
      // Van twee naar één vinger: die ene verschuift voortaan vanaf zijn eigen plaats.
      knijpbegin = null;
      if (pointers.size === 2) startKnijp();
    };

    const wiel = (gebeurtenis: WheelEvent) => {
      gebeurtenis.preventDefault();
      const beeld = beeldRef.current;
      if (!beeld) return;
      // Een trackpad die knijpt, stuurt wiel met ctrlKey en kleine stappen.
      const stap = gebeurtenis.deltaMode === 1 ? 0.05 : gebeurtenis.ctrlKey ? 0.006 : 0.0015;
      zetBeeld(zoomRond(beeld, inVak(gebeurtenis), Math.exp(-gebeurtenis.deltaY * stap), grenzen));
    };

    const dubbel = (gebeurtenis: MouseEvent) => {
      if (opKnop(gebeurtenis)) return;
      const beeld = beeldRef.current;
      if (beeld) zetBeeld(zoomRond(beeld, inVak(gebeurtenis), 2, grenzen));
    };

    // Safari op iPad en iPhone zoomt anders de hele pagina mee.
    const geenPaginazoom = (gebeurtenis: Event) => gebeurtenis.preventDefault();

    vak.addEventListener("pointerdown", omlaag);
    vak.addEventListener("pointermove", beweeg);
    vak.addEventListener("pointerup", omhoog);
    vak.addEventListener("pointercancel", omhoog);
    vak.addEventListener("wheel", wiel, { passive: false });
    vak.addEventListener("dblclick", dubbel);
    vak.addEventListener("gesturestart", geenPaginazoom);
    return () => {
      vak.removeEventListener("pointerdown", omlaag);
      vak.removeEventListener("pointermove", beweeg);
      vak.removeEventListener("pointerup", omhoog);
      vak.removeEventListener("pointercancel", omhoog);
      vak.removeEventListener("wheel", wiel);
      vak.removeEventListener("dblclick", dubbel);
      vak.removeEventListener("gesturestart", geenPaginazoom);
    };
  }, [vakRef, beeldRef, zetBeeld, grenzen]);
}
