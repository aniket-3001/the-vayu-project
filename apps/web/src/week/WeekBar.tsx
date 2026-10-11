import { ChevronLeft, ChevronRight, Info, Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { levelForAqi } from '../design/levels';
import { levelVars } from '../today/ui/format';
import { dayAqi } from './scene';
import type { Recorded, RecordedDay } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "6 Oct" for a chip. */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ''}`;
}

/** "Tue 21 Oct 2025, 8 am": the moment the app takes as now. */
export function momentWords(day: RecordedDay): string {
  const [year, month, d] = day.date.split('-');
  const weekday = WEEKDAYS[new Date(`${day.date}T12:00:00+05:30`).getUTCDay()] ?? '';
  const india = new Date(Date.parse(day.asOf) + 5.5 * 3_600_000);
  const h = india.getUTCHours();
  const ampm = h < 12 ? 'am' : 'pm';
  return `${weekday} ${String(Number(d))} ${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}, ${String(h % 12 === 0 ? 12 : h % 12)} ${ampm}`;
}

/**
 * The strip above the app while the recorded days plays: which day it is, a chip for each day coloured by how the air
 * was, play and stop, and the way out. What the recording is made of is one tap away.
 */
export function WeekBar({
  recorded,
  index,
  playing,
  onSelect,
  onPlay,
  onLeave,
}: {
  readonly recorded: Recorded;
  readonly index: number;
  readonly playing: boolean;
  readonly onSelect: (index: number) => void;
  readonly onPlay: (on: boolean) => void;
  readonly onLeave: () => void;
}): React.JSX.Element {
  const day = recorded.days[index];
  const active = useRef<HTMLButtonElement | null>(null);
  const [about, setAbout] = useState(false);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [index]);
  if (day === undefined) return <></>;
  const count = recorded.days.length;
  return (
    <header className="week-bar" aria-label="Recorded days">
      <div className="week-row">
        <button
          type="button"
          className="week-step"
          aria-label="Previous day"
          disabled={index === 0}
          onClick={() => {
            onSelect(index - 1);
          }}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="week-chips" role="tablist" aria-label="Days">
          {recorded.days.map((d, i) => {
            const aqi = dayAqi(d);
            return (
              <button
                key={d.date}
                ref={i === index ? active : undefined}
                type="button"
                role="tab"
                aria-selected={i === index}
                className="week-chip"
                style={aqi === undefined ? undefined : levelVars(levelForAqi(aqi))}
                onClick={() => {
                  onSelect(i);
                }}
              >
                <span className="week-dot" aria-hidden="true" />
                {shortDate(d.date)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="week-step"
          aria-label="Next day"
          disabled={index === count - 1}
          onClick={() => {
            onSelect(index + 1);
          }}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="week-row week-now">
        <p className="week-title">
          <strong>{day.title}</strong>
          <span className="week-when">
            {momentWords(day)} · recorded
            {day.tags.length > 0 ? ` · ${day.tags.join(', ')}` : ''}
          </span>
        </p>
        <button
          type="button"
          className="week-step"
          aria-label="What is this recording"
          aria-expanded={about}
          onClick={() => {
            setAbout(!about);
          }}
        >
          <Info size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="week-step"
          aria-label={playing ? 'Pause the week' : 'Play the week'}
          onClick={() => {
            onPlay(!playing);
          }}
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="week-step"
          aria-label="Leave the recorded days"
          onClick={onLeave}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {about && (
        <div className="week-about-card small" role="note">
          <p>
            Seven real days from the last six months, each played as if it were today at the hour
            shown. Everything on screen is worked out from what was recorded then, by the same app
            that runs on the live air.
          </p>
          <ul>
            <li>Air: {recorded.sources.air}.</li>
            <li>Weather: {recorded.sources.weather}.</li>
            <li>Gases: {recorded.sources.gases}.</li>
            <li>Fires: {recorded.sources.fires}.</li>
          </ul>
          <p>
            The hours after the moment are what was recorded next, shown as a forecast would be.
            GRAP stages are our own unofficial estimate, never the order. The two places and the
            person are two sample places, Home and a Park; anything you add lives only on this page.
          </p>
        </div>
      )}
    </header>
  );
}
