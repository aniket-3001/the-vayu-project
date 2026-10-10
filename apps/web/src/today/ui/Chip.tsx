import { levelForAqi } from '../../design/levels';
import { levelVars } from './format';

/** The AQI number on its level colour. The number is the label; the level name rides along for screen readers. */
export function AqiChip({ aqi }: { readonly aqi: number }): React.JSX.Element {
  const level = levelForAqi(aqi);
  return (
    <span className="chip" style={levelVars(level)}>
      {aqi}
      <span className="sr-only"> AQI, {level.name}</span>
    </span>
  );
}

/** A small hairline pill for the honesty labels: Sample data, Live, Estimate. */
export function Pill({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <span className="pill">{children}</span>;
}
