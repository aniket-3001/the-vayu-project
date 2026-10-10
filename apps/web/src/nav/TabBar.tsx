import { Globe, ScanEye, UserRound, Wind } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'My Air', Icon: Wind, end: true },
  { to: '/map', label: 'Map', Icon: Globe, end: false },
  { to: '/exposure', label: 'Exposure', Icon: UserRound, end: false },
  { to: '/lens', label: 'AR Lens', Icon: ScanEye, end: false },
] as const;

/** The four places the app goes, in a pill at the bottom of the screen. */
export function TabBar(): React.JSX.Element {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="tab-link">
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
