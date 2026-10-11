import '@testing-library/jest-dom/vitest';
import { AirStore, setAirStoreFactory } from './air/store';
import { sampleAirSource } from './air/sampleSource';
import { setClock } from './clock';
import { SAMPLE_AS_OF } from './today/sample';

// Tests run on a made-up moment and made-up air, so a screen is the same on every run.
setClock(() => SAMPLE_AS_OF);
setAirStoreFactory(() => new AirStore(sampleAirSource()));

// jsdom has no layout, so it does not implement scrolling into view; the app calls it for the chat.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (): void => undefined;
}

// jsdom has no canvas and says so loudly each time one is asked for a drawing context; the app copes with none.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (): null => null;
}
