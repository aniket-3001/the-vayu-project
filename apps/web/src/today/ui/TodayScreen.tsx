import { levelForAqi } from '../../design/levels';
import { clock12, dayMonth, weekday } from '../time';
import type { TodayData } from '../types';
import { Attribution } from './Attribution';
import { Daily } from './Daily';
import { Health } from './Health';
import { Hero } from './Hero';
import { History } from './History';
import { Hourly } from './Hourly';
import { PollutantTiles } from './Pollutants';
import { levelVars } from './format';

/** One place, today: IQAir's order, our colours, and a provenance line. */
export function TodayScreen({
  data,
  back,
}: {
  readonly data: TodayData;
  readonly back?: React.ReactNode;
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
        <div className="col-main">
          <Hero data={data} />
          <Attribution data={data} />
          <Hourly data={data} />
          <Daily data={data} />
        </div>
        <div className="col-side">
          <PollutantTiles data={data} />
          <Health aqi={data.aqi} />
        </div>
        <div className="col-wide">
          <History data={data} />
        </div>
      </main>
    </div>
  );
}
