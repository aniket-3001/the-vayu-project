import { LEVELS } from '../../design/levels';
import { AqiChip } from '../../today/ui/Chip';
import { concentration } from '../../today/ui/format';
import type { Cell, Summary as SummaryData } from '../model';

const SOURCE_WORDS: Readonly<Record<Cell['source'], string>> = {
  outdoor: 'open air from the nearest monitor',
  trees: 'open air, scaled for trees (assumed)',
  assumed: 'indoors, scaled by an assumption',
  device: 'indoors, from your monitor (sample)',
};

/** The answer first, then the reasons: what you breathed, what open air would have been, and how sure we are. */
export function Summary({
  summary,
  cells,
  day,
}: {
  readonly summary: SummaryData | undefined;
  readonly cells: readonly Cell[];
  readonly day: 'today' | 'yesterday';
}): React.JSX.Element {
  if (summary === undefined) {
    return (
      <section className="card" aria-labelledby="sum-title">
        <h2 id="sum-title">Your day in the air</h2>
        <p className="muted">
          Nothing to add up yet. Set a place below, or turn on live location, and the hours fill in.
        </p>
      </section>
    );
  }
  const assumed = cells.filter(
    (cell) => cell.source === 'assumed' || cell.source === 'trees',
  ).length;
  const total = Math.max(
    1,
    summary.hoursByLevel.reduce((a, b) => a + b, 0),
  );
  const span = summary.fullDay ? 'over the day' : `so far today (${String(summary.hours)} hours)`;
  const saved = summary.openAirAqi - summary.aqi;
  return (
    <section className="card" aria-labelledby="sum-title">
      <h2 id="sum-title">Your day in the air</h2>
      <p className="sum-lead">
        <AqiChip aqi={summary.aqi} /> You breathed an average of AQI {summary.aqi},{' '}
        {summary.level.name.toLowerCase()}, {span}.
      </p>
      <p>
        {saved > 0
          ? `The same hours in open air would have averaged AQI ${String(summary.openAirAqi)}. Where you spent your time kept ${String(saved)} points off.`
          : `The same hours in open air would have averaged AQI ${String(summary.openAirAqi)}, so where you were made no difference.`}
      </p>
      <div
        className="level-bar"
        role="img"
        aria-label={`Hours in each level: ${LEVELS.map((l, i) => `${l.name} ${String(summary.hoursByLevel[i] ?? 0)}`).join(', ')}`}
      >
        {LEVELS.map((level, i) => {
          const hours = summary.hoursByLevel[i] ?? 0;
          return hours === 0 ? null : (
            <span
              key={level.name}
              style={{ width: `${String((hours / total) * 100)}%`, background: level.solid }}
              title={`${level.name}: ${String(hours)} h`}
            />
          );
        })}
      </div>
      <p className="muted small">
        {concentration(summary.meanPm25)} µg/m³ PM<sub>2.5</sub> on average
        {summary.fullDay
          ? `, ${summary.whoTimes.toFixed(1)} times the WHO 24-hour guideline of 15 µg/m³`
          : ''}
        .
        {assumed > 0 &&
          ` ${String(assumed)} of ${String(summary.hours)} hours rest on an assumption.`}
        {day === 'today' ? '' : ' A finished day.'}
      </p>
      <details className="how">
        <summary>How each hour is worked out</summary>
        <ul>
          {Array.from(new Set(cells.map((c) => c.source))).map((source) => (
            <li key={source}>{SOURCE_WORDS[source]}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
