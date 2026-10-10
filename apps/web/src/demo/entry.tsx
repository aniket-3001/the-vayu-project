import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import './demo.css';
import { DeviceShell } from './DeviceShell';
import { applyScenario, scenarioById } from './scenarios';

/**
 * The prototype build only (`npm run dev:demo`, `npm run build:demo`): the app inside a phone, tablet or laptop
 * frame, with scenarios. `?embed` is the app on its own, which is what runs inside a frame. `?demo=grap` stages
 * a scenario before the app opens. None of this is in the deployed app.
 */
export function startDemo(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const staged = scenarioById(params.get('demo'));
  const alone = params.has('embed');
  if (staged !== undefined) {
    const route = applyScenario(window.localStorage, staged);
    if (alone) window.location.hash = route;
  }
  if (alone) document.documentElement.classList.add('embedded');
  createRoot(root).render(<StrictMode>{alone ? <App /> : <DeviceShell />}</StrictMode>);
}
