import '@fontsource-variable/hanken-grotesk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AirStore, setAirStoreFactory } from './air/store';
import { liveAirSource } from './air/liveSource';
import { API_URL } from './config';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html needs a #root');

// The prototype shell is a separate build: this branch is removed from the deployed bundle.
if (import.meta.env.VITE_DEMO === '1') {
  void import('./demo/entry').then(({ startDemo }) => {
    startDemo(root);
  });
} else {
  // The deployed app reads the real air from our API on AWS.
  setAirStoreFactory(() => new AirStore(liveAirSource(API_URL)));
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
