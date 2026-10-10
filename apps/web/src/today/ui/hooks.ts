import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** A number that settles to its value over 600 ms, from wherever it was. Instant when motion is reduced. */
export function useSettle(target: number): number {
  const reduced = useReducedMotion() === true;
  const [shown, setShown] = useState(reduced ? target : 0);
  const from = useRef(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setShown(target);
      from.current = target;
      return;
    }
    const controls = animate(from.current, target, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (value) => {
        from.current = value;
        setShown(Math.round(value));
      },
    });
    return () => {
      controls.stop();
    };
  }, [target, reduced]);
  return shown;
}

/** The width of an element, for charts that draw at real pixel size so their text stays readable. */
export function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width;
      if (w !== undefined && w > 0) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}
