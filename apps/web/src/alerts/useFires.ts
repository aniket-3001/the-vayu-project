import { useEffect, useState } from 'react';
import { fetchFireCount, recall, remember } from '../map/live';
import { API_URL } from '../map/useMapData';

/** The number of fires our API counted in the last 24 hours, or undefined while it loads or if it cannot be reached. */
export function useFires(fetchImpl: typeof fetch = fetch): number | undefined {
  const [fires, setFires] = useState<number | undefined>(() => {
    const saved = recall('fires');
    return typeof saved === 'number' ? saved : undefined;
  });
  useEffect(() => {
    let current = true;
    fetchFireCount(API_URL, fetchImpl).then(
      (count) => {
        if (current && count !== undefined) {
          remember('fires', count);
          setFires(count);
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [fetchImpl]);
  return fires;
}
