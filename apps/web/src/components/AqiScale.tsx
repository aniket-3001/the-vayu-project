import { LEVELS } from '../design/levels';
import { useAirUnits } from '../units/AirUnits';
import { cigaretteFigure, cigarettesForAqi } from '../units/smoke';

/** Where an AQI sits along the six equal colour steps, 0 to 1. Each step is its own level; 301 and up share the last. */
export function scalePosition(aqi: number): number {
  if (!Number.isFinite(aqi)) return 0;
  const index = Math.max(
    0,
    LEVELS.findLastIndex((level) => aqi >= level.from),
  );
  const from = LEVELS[index]?.from ?? 0;
  const next = LEVELS[index + 1]?.from ?? 501;
  const within = Math.min(1, Math.max(0, (aqi - from) / (next - from)));
  return (index + within) / LEVELS.length;
}

/** Short forms for a narrow scale, such as the one beside the map's buttons. */
const ABBR: Readonly<Record<string, string>> = {
  Good: 'Good',
  Moderate: 'Mod.',
  'Unhealthy for sensitive groups': 'Sens.',
  Unhealthy: 'Unh.',
  'Very unhealthy': 'V. bad',
  Hazardous: 'Haz.',
};

/**
 * What each colour means: the six AQI levels as a bar, each with its short name and its range, and, when an
 * AQI is given, a marker where it falls.
 */
export function AqiScale({
  aqi,
  className = '',
}: {
  readonly aqi?: number;
  readonly className?: string;
}): React.JSX.Element {
  // With the cigarette switch on, the scale is in cigarettes a day, so the colours and the numbers agree.
  const { smoke } = useAirUnits();
  return (
    <div
      className={`aqi-scale ${className}`.trim()}
      role="img"
      aria-label={`What the colours mean, US AQI: ${LEVELS.map((level, i) => `${level.name} from ${String(level.from)}${i === LEVELS.length - 1 ? ' up' : ` to ${String((LEVELS[i + 1]?.from ?? 1) - 1)}`}`).join('; ')}`}
    >
      <div className="aqi-scale-bar">
        {LEVELS.map((level) => (
          <span key={level.name} style={{ background: level.solid }} />
        ))}
        {aqi !== undefined && (
          <i className="aqi-scale-mark" style={{ left: `${String(scalePosition(aqi) * 100)}%` }} />
        )}
      </div>
      <div className="aqi-scale-names" aria-hidden="true">
        {LEVELS.map((level, i) => (
          <span key={level.name}>
            <b>
              <span className="full">{level.short}</span>
              <span className="abbr">{ABBR[level.name] ?? level.short}</span>
            </b>
            <small>
              {smoke ? cigaretteFigure(cigarettesForAqi(level.from)) : level.from}
              {i === LEVELS.length - 1 ? '+' : ''}
            </small>
          </span>
        ))}
      </div>
      <p className="aqi-scale-unit" aria-hidden="true">
        {smoke ? 'cigarettes a day' : 'US AQI scale. GRAP stages use India’s own scale.'}
      </p>
    </div>
  );
}
