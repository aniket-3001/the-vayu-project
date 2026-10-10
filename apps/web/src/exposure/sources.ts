import { airStore } from '../air/store';

/** One honest line under the exposure explainer: where the outdoor air comes from, and what is assumed indoors. */
export const sourcesNote = (): string =>
  airStore().kind === 'sample'
    ? 'Right now the outdoor air is made-up sample data. The method is the real one.'
    : 'Outdoor air is the nearest monitor’s hourly reading (OpenAQ), or the regional model’s where no monitor has reported lately. Indoor air is assumed from it. The Vayu monitor is not built yet, so no indoor reading is measured.';
