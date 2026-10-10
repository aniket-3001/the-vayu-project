import { useMemo, useState } from 'react';
import { SAMPLE_IDS, sampleDay, type SampleId } from './today/sample';
import { SampleSwitcher } from './today/ui/SampleSwitcher';
import { TodayScreen } from './today/ui/TodayScreen';

const fromUrl = (): SampleId => {
  const wanted = new URLSearchParams(window.location.search).get('day');
  return SAMPLE_IDS.find((id) => id === wanted) ?? 'unhealthy';
};

export function App(): React.JSX.Element {
  const [id, setId] = useState<SampleId>(fromUrl);
  const data = useMemo(() => sampleDay(id), [id]);
  return (
    <>
      <div className="bar">
        <span className="wordmark">Vayu Air</span>
        <SampleSwitcher
          value={id}
          onChange={(next) => {
            setId(next);
            window.history.replaceState(null, '', `?day=${next}`);
          }}
        />
      </div>
      <TodayScreen data={data} />
    </>
  );
}
