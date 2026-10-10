import { cigarettesPerDay, describeCigarettes, SMOKE_CAVEAT } from './smoke';
import { useAirUnits } from './AirUnits';

/** How many whole cigarettes to draw before saying "and more". */
const MAX_DRAWN = 10;

/** One cigarette standing up, lit at the top, with smoke rising from it. `fill` is how much of it is left, 0 to 1. */
function Cigarette({
  fill,
  index,
}: {
  readonly fill: number;
  readonly index: number;
}): React.JSX.Element {
  return (
    <span className="cig" style={{ ['--delay' as string]: `${String(index * 0.35)}s` }}>
      <span className="wisp w1" />
      <span className="wisp w2" />
      <span className="wisp w3" />
      <span className="cig-body" style={{ height: `${String(14 + fill * 46)}px` }}>
        <span className="cig-ember" />
        <span className="cig-paper" />
        <span className="cig-filter" />
      </span>
    </span>
  );
}

/**
 * The smoking equivalent as a card of its own: cigarettes drawn one by one, smoke curling up from each, and the
 * number said in words. Only there when the relatable measure is on; it is meant to be noticed.
 */
export function SmokeCard({
  pm25,
  title = 'In cigarettes',
  note,
}: {
  readonly pm25: number;
  readonly title?: string;
  readonly note?: string;
}): React.JSX.Element | null {
  const { smoke } = useAirUnits();
  if (!smoke) return null;
  const perDay = cigarettesPerDay(pm25);
  const whole = Math.floor(perDay);
  const drawn = Math.min(MAX_DRAWN, whole);
  const part = perDay - whole;
  const sticks = Array.from({ length: drawn }, (_, i) => ({ fill: 1, key: i }));
  if (part >= 0.1 && drawn < MAX_DRAWN) sticks.push({ fill: part, key: drawn });
  return (
    <section className="smoke-card" aria-labelledby="smoke-title">
      <div className="smoke-copy">
        <h2 id="smoke-title">{title}</h2>
        <p className="smoke-big">
          {perDay < 0.5
            ? 'Less than half a cigarette'
            : `About ${describeCigarettes(perDay).replace('about ', '').replace(' a day', '')}`}
          <span> a day</span>
        </p>
        {note !== undefined && <p className="small">{note}</p>}
        <p className="small smoke-caveat">{SMOKE_CAVEAT}</p>
      </div>
      <div className="cig-row" aria-hidden="true">
        {sticks.map(({ fill, key }) => (
          <Cigarette key={key} fill={fill} index={key} />
        ))}
        {whole > MAX_DRAWN && <span className="cig-more">+{whole - MAX_DRAWN}</span>}
      </div>
    </section>
  );
}
