import { useCallback, useEffect, useState } from 'react';
import { headingFrom } from './model';

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionedOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * Which way the phone faces, from its compass. iPhones ask first, and only when a person taps, so this
 * gives a function to call from a button. Without a heading the picture keeps north at the top.
 */
export function useHeading(): {
  readonly heading: number | undefined;
  readonly needsTap: boolean;
  readonly enable: () => void;
} {
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const needsTap =
    supported &&
    !listening &&
    typeof (window.DeviceOrientationEvent as PermissionedOrientation).requestPermission ===
      'function';

  const listen = useCallback(() => {
    setListening(true);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const requiresTap =
      typeof (window.DeviceOrientationEvent as PermissionedOrientation).requestPermission ===
      'function';
    if (requiresTap && !listening) return;
    const onTurn = (event: Event): void => {
      const e = event as OrientationEventWithCompass;
      const next = headingFrom({
        webkitCompassHeading: e.webkitCompassHeading,
        alpha: e.alpha,
        absolute: e.absolute,
      });
      if (next !== undefined) setHeading(Math.round(next));
    };
    window.addEventListener('deviceorientationabsolute', onTurn);
    window.addEventListener('deviceorientation', onTurn);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onTurn);
      window.removeEventListener('deviceorientation', onTurn);
    };
  }, [supported, listening]);

  const enable = useCallback(() => {
    const ask = (window.DeviceOrientationEvent as PermissionedOrientation).requestPermission;
    if (typeof ask !== 'function') {
      listen();
      return;
    }
    ask.call(window.DeviceOrientationEvent).then(
      (answer) => {
        if (answer === 'granted') listen();
      },
      () => undefined,
    );
  }, [listen]);

  return { heading, needsTap, enable };
}
