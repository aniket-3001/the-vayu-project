import { AssistantFab } from '../assistant/AssistantFab';
import { SmokeToggle } from '../units/AirUnits';
import { GpsToggle } from './GpsToggle';

/**
 * The three round buttons that are always there: Ask, cigarettes, GPS. On My Air and Exposure they float at the
 * bottom right; on the Map and the AIR Lens the screen puts them inside its own bottom card, in a column (map) or a
 * row (lens), so they never sit over what the card shows.
 */
export function DockButtons({
  layout = 'column',
}: {
  readonly layout?: 'column' | 'row';
}): React.JSX.Element {
  return (
    <div className={`dock-buttons ${layout}`}>
      <AssistantFab />
      <SmokeToggle />
      <GpsToggle />
    </div>
  );
}
