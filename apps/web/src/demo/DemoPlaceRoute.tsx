import { ChevronLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { usePins } from '../places/usePins';
import { readingForPin, sampleIdForPin } from '../places/placeSample';
import { SAMPLE_IDS } from '../today/sample';
import { TodayScreen } from '../today/ui/TodayScreen';
import { SampleSwitcher } from './SampleSwitcher';

/**
 * A place page for the prototype: the same screen, with a row that flips it between made-up days. It exists only
 * in the prototype build; the deployed app has no such row and no made-up day.
 */
export function DemoPlaceRoute(): React.JSX.Element {
  const { id = '' } = useParams();
  const { pins } = usePins();
  const [params, setParams] = useSearchParams();
  const pin = pins.find((candidate) => candidate.id === id);
  const wanted = SAMPLE_IDS.find((day) => day === params.get('day'));
  const day = wanted ?? (pin === undefined ? 'unhealthy' : sampleIdForPin(pin));
  if (pin === undefined) {
    return (
      <div className="page">
        <main className="layout">
          <p className="empty">
            That place is not pinned on this device. <Link to="/">Back to your places</Link>
          </p>
        </main>
      </div>
    );
  }
  return (
    <>
      <div className="bar bar-switcher">
        <SampleSwitcher
          value={day}
          onChange={(next) => {
            setParams({ day: next }, { replace: true });
          }}
        />
      </div>
      <TodayScreen
        data={readingForPin(pin, day)}
        pin={pin}
        back={
          <Link to="/" className="back">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
          </Link>
        }
      />
    </>
  );
}
