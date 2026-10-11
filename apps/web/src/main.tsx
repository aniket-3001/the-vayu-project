import '@fontsource-variable/hanken-grotesk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountGate } from './account/AccountContext';
import { App } from './App';
import { AirStore, setAirStoreFactory } from './air/store';
import { liveAirSource } from './air/liveSource';
import { API_URL } from './config';
import { setStarterPins } from './data/pins';
import { setOwnerStartsWithSamples } from './exposure/spots';
import { liveLocation } from './places/liveLocation';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html needs a #root');

if (window.location.hash.startsWith('#/week')) {
  // The recorded days: seven real days played through the same app, opened by an unlisted address.
  void import('./week/entry').then(({ startWeek }) => startWeek(root));
} else {
  // The deployed app reads the real air from our API on AWS.
  setAirStoreFactory(() => new AirStore(liveAirSource(API_URL)));
  // A new person starts with empty places to fill in, not with someone else's.
  setStarterPins([]);
  setOwnerStartsWithSamples(false);
  // If live location was left on last time, carry on following the device.
  liveLocation().resume();
  createRoot(root).render(
    <StrictMode>
      <AccountGate>
        <App />
      </AccountGate>
    </StrictMode>,
  );
}
