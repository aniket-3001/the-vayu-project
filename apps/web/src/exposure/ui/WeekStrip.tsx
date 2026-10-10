import { levelForAqi } from '../../design/levels';
import { SmokeFigure } from '../../units/AirUnits';
import { formatDate, type DateKey, type Summary } from '../model';

const shortDay = (date: DateKey): string => formatDate(date).split(' ')[0] ?? '';

/** The past seven days as bars in the colour of the air each one added up to. Tap a day to open it. */
export function WeekStrip({
  days,
  onOpen,
}: {
  readonly days: readonly { readonly date: DateKey; readonly summary: Summary | undefined }[];
  readonly onOpen: (date: DateKey) => void;
}): React.JSX.Element {
  const known = days.filter(
    (d): d is { date: DateKey; summary: Summary } => d.summary !== undefined,
  );
  const best = known.reduce<(typeof known)[number] | undefined>(
    (a, b) => (a === undefined || b.summary.aqi < a.summary.aqi ? b : a),
    undefined,
  );
  const worst = known.reduce<(typeof known)[number] | undefined>(
    (a, b) => (a === undefined || b.summary.aqi > a.summary.aqi ? b : a),
    undefined,
  );
  const meanPm =
    known.length === 0 ? 0 : known.reduce((s, d) => s + d.summary.meanPm25, 0) / known.length;
  const top = Math.max(100, ...known.map((d) => d.summary.aqi));

  return (
    <section className="card" aria-labelledby="week-title">
      <h2 id="week-title">The past week</h2>
      {best !== undefined && worst !== undefined ? (
        <p>
          Cleanest day: <strong>{formatDate(best.date)}</strong>, AQI {best.summary.aqi}. Worst:{' '}
          <strong>{formatDate(worst.date)}</strong>, AQI {worst.summary.aqi}.
        </p>
      ) : (
        <p className="muted">Nothing to add up. Set a place and the days fill in.</p>
      )}
      {best !== undefined && (
        <p className="sum-lead">
          <SmokeFigure pm25={meanPm} variant="chip" /> a day, on average over the week
        </p>
      )}
      <ul className="week-bars">
        {days.map(({ date, summary }) => {
          const level = summary === undefined ? undefined : levelForAqi(summary.aqi);
          return (
            <li key={date}>
              <button
                type="button"
                className="week-day"
                disabled={summary === undefined}
                aria-label={
                  summary === undefined
                    ? `${formatDate(date)}: no data`
                    : `${formatDate(date)}: AQI ${String(summary.aqi)}, ${level?.name.toLowerCase() ?? ''}. Open this day`
                }
                onClick={() => {
                  onOpen(date);
                }}
              >
                <span className="week-num tnum">{summary?.aqi ?? '–'}</span>
                <span className="week-track">
                  <span
                    className="week-fill"
                    style={{
                      height: `${String(summary === undefined ? 0 : Math.max(8, (summary.aqi / top) * 100))}%`,
                      background: level?.solid,
                    }}
                  />
                </span>
                <span className="week-name">{shortDay(date)}</span>
                <span className="week-date muted small">{formatDate(date).split(' ')[1]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
