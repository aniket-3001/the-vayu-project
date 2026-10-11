import type { Pin } from '../../data/pins';
import { levelForAqi } from '../../design/levels';
import { clock12, dayMonth, weekday } from '../time';
import type { TodayData } from '../types';
import { Attribution } from './Attribution';
import { Daily } from './Daily';
import { Health } from './Health';
import { Hero } from './Hero';
import { History } from './History';
import { Hourly } from './Hourly';
import { PlaceSpecial } from './PlaceSpecial';
import { PollutantTiles } from './Pollutants';
import { levelVars } from './format';

/** One place, today: IQAir's order, our colours, and a provenance line. */
export function TodayScreen({
  data,
  back,
  pin,
}: {
  readonly data: TodayData;
  readonly back?: React.ReactNode;
  /** The pinned place, so the page can say what is special about it (a school's assembly, a park's best walk). */
  readonly pin?: Pin;
}): React.JSX.Element {
  const level = levelForAqi(data.aqi);
  return (
    <div className="page" style={levelVars(level)}>
      <header className="place">
        {back}
        <p className="crumb">
          {data.place.region} <span aria-hidden="true">›</span> {data.place.name}
        </p>
        <h1>{data.place.name}</h1>
        <p className="muted">
          Air quality · {weekday(data.asOf)} {dayMonth(data.asOf)}, {clock12(data.asOf)} India time
        </p>
      </header>
      <main className="layout">
        {/* Two columns that line up by row: the air and what is special here; the hours and the pollutants; the days
            and what to do. On a phone they are one column in this order. */}
        <div className="cell">
          <Hero data={data} />
          <Attribution data={data} />
        </div>
        <PlaceSpecial data={data} pin={pin} />
        <Hourly data={data} />
        <PollutantTiles data={data} />
        <Daily data={data} />
        <Health aqi={data.aqi} />
        <div className="col-wide">
          <History data={data} />
        </div>
      </main>
    </div>
  );
}
