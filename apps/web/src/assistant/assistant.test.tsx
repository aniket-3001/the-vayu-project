// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleDay } from '../today/sample';
import { apiAssistant } from './api';
import { AssistantFab } from './AssistantFab';
import { spanWords, buildContext } from './context';
import { localAssistant } from './local';
import type { AssistantContext, AssistantSource } from './types';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'speechSynthesis');
});

const base: AssistantContext = {
  place: 'Home',
  aqi: 158,
  level: 'Unhealthy',
  pm25: 71.3,
  best: undefined,
  grapStage: 0,
  alerts: ['Avoid park walks today'],
  fires: 127,
  people: [{ name: 'Asha', age: 9, day: 'school' }],
};
const clean: AssistantContext = {
  ...base,
  aqi: 32,
  level: 'Good',
  pm25: 5.8,
  best: { span: '3 to 4 pm', aqi: 28 },
  alerts: [],
};
const ask = async (q: string, c = base): Promise<string> => (await localAssistant.ask(q, c)).text;

describe('the local answers', () => {
  it('say when a walk is good, and when there is no clean hour', async () => {
    expect(await ask('When can I go for a walk?', clean)).toMatch(
      /A good hour for a walk: 3 to 4 pm/u,
    );
    expect(await ask('can i go for a run', base)).toMatch(/No clean hour outside today at Home/u);
    expect(
      await ask('best time to exercise', { ...base, best: { span: '5 to 6 pm', aqi: 120 } }),
    ).toMatch(/cleanest hour is 5 to 6 pm/u);
  });

  it('answer about school, with the child by name, and point to official orders in a bad stage', async () => {
    const text = await ask('Is school safe today?');
    expect(text).toMatch(/Asha is on your list/u);
    expect(text).toMatch(/moved indoors/u);
    const severe = await ask('school emergency', { ...base, aqi: 430, grapStage: 4 });
    expect(severe).toMatch(/GRAP Stage 4/u);
    expect(severe).toMatch(/unofficial/u);
    expect(severe).toMatch(/call 112/u);
    expect(await ask('school today?', clean)).toMatch(/School is fine from the air's side/u);
  });

  it('answer about masks, windows, alerts, stubble burning and the smoking equivalent', async () => {
    expect(await ask('Do I need a mask?')).toMatch(/wear a well-fitted N95 or FFP2/u);
    expect(await ask('do i need a mask', clean)).toMatch(/^No\./u);
    expect(await ask('should I open the windows?')).toMatch(/Keep the windows shut/u);
    expect(await ask('open the windows', clean)).toMatch(/^Open them/u);
    expect(await ask('What alerts are coming?')).toMatch(/Avoid park walks today/u);
    expect(await ask('any warnings', clean)).toMatch(/Nothing to warn about/u);
    expect(await ask('stubble burning?')).toMatch(/127 fires.*Contact authorities/su);
    expect(await ask('fires?', { ...base, fires: undefined })).toMatch(
      /could not read the fire count/u,
    );
    expect(await ask('how many cigarettes is this?')).toMatch(/about 3\.2 cigarettes/u);
  });

  it('fall back to saying where things stand and what can be asked', async () => {
    const text = await ask('tell me a joke');
    expect(text).toMatch(/Home is at AQI 158, unhealthy/u);
    expect(text).toMatch(/Ask about a walk/u);
  });

  it('never use exclamation marks, emoji or the banned words', async () => {
    for (const q of [
      'walk',
      'school',
      'mask',
      'windows',
      'alerts',
      'stubble',
      'cigarette',
      'hello',
    ]) {
      for (const c of [base, clean]) {
        expect(await ask(q, c)).not.toMatch(/!|\p{Extended_Pictographic}|unlock|seamless|oops/iu);
      }
    }
  });
});

describe('the answers behind our API', () => {
  const reply = (body: unknown, status = 200): typeof fetch =>
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    ) satisfies typeof fetch;

  it('use what Bedrock says, and the Polly audio file it sends', async () => {
    const answer = await apiAssistant(
      'https://x.test/',
      reply({ text: 'From Bedrock.', audioUrl: 'https://a.test/x.mp3' }),
    ).ask('hi', base);
    expect(answer).toMatchObject({
      text: 'From Bedrock.',
      audioUrl: 'https://a.test/x.mp3',
      basis: 'Amazon Bedrock, from live data',
    });
  });

  it('post the question and what the app knows to /v1/assistant', async () => {
    const fetcher = reply({ text: 'ok' });
    await apiAssistant('https://x.test/', fetcher).ask('hello', base);
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] ?? ['', {}];
    expect(url).toBe('https://x.test/v1/assistant');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      question: 'hello',
      context: { place: 'Home' },
    });
  });

  it('fall back to the local answers when the service is down, slow to answer or sends rubbish', async () => {
    for (const f of [
      reply({}, 500),
      reply({ text: '' }),
      reply({ nope: 1 }),
      vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    ]) {
      const answer = await apiAssistant('https://x.test', f).ask('do I need a mask', base);
      expect(answer.text).toMatch(/N95/u);
      expect(answer.basis).toMatch(/sample data/u);
    }
  });
});

describe('the context', () => {
  it('says an hour the way a person does', () => {
    expect(spanWords('2026-10-10T09:30:00.000Z')).toBe('3 to 4 pm');
    expect(spanWords('2026-10-10T03:30:00.000Z')).toBe('9 to 10 am');
    expect(spanWords('2026-10-10T06:00:00.000Z')).toBe('11 am to 12 pm');
  });

  it('gathers the air, the best hour, the stage, the alerts and the people', () => {
    const c = buildContext('Home', sampleDay('hazardous'), [], 12, [
      { id: 'a', name: 'Asha', age: 9, day: 'school' },
    ]);
    expect(c).toMatchObject({ place: 'Home', level: 'Hazardous', grapStage: 4, fires: 12 });
    expect(c.people).toEqual([{ name: 'Asha', age: 9, day: 'school' }]);
  });
});

describe('the assistant button', () => {
  const open = (source?: AssistantSource): void => {
    render(
      <MemoryRouter>
        <AssistantFab {...(source === undefined ? {} : { source })} />
      </MemoryRouter>,
    );
  };

  it('is always there, and opens a chat with suggested questions', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    const chat = screen.getByRole('dialog', { name: 'Vayu assistant' });
    expect(within(chat).getByRole('group', { name: 'Suggested questions' })).toBeInTheDocument();
    expect(chat).toHaveTextContent('Bedrock and Polly plug in here');
  });

  it('answers a question typed in, and one tapped from the suggestions', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Your message' }),
      'Do I need a mask?{Enter}',
    );
    expect(await screen.findByText(/well-fitted N95 or FFP2/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Is school safe today?' }));
    expect(
      await screen.findByText(/School is fine|moved indoors|Outdoor play/u),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/From the sample data in this prototype/u).length).toBe(2);
  });

  it('uses whichever source it is given, so Bedrock can take over', async () => {
    const source: AssistantSource = {
      ask: () =>
        Promise.resolve({ text: 'From Bedrock.', basis: 'Amazon Bedrock, from live data' }),
    };
    open(source);
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello{Enter}');
    expect(await screen.findByText('From Bedrock.')).toBeInTheDocument();
    expect(
      screen.getByText('Amazon Bedrock, from live data', { exact: false }),
    ).toBeInTheDocument();
  });

  it('reads an answer aloud when the browser can speak', async () => {
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel: vi.fn() },
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.click(screen.getByRole('button', { name: 'Do I need a mask?' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Listen to this answer' }));
    expect(speak).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('says what to do when nothing is pinned, and closes with Escape', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'walk?{Enter}');
    expect(await screen.findByText(/Pin a place on My Air first/u)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the best hour in the context', () => {
  it('says tomorrow when the cleanest hour is after midnight', () => {
    const c = buildContext('Home', sampleDay('good'), [], undefined, []);
    expect(c.best?.span).toMatch(/ tomorrow$/u);
  });

  it('adds an outdoor walk for someone on the list when it is told, and does not answer it as a question', async () => {
    window.localStorage.setItem(
      'vayu.people.v1',
      JSON.stringify({
        people: [
          { id: 'me', name: 'Me', age: 30, day: 'work' },
          { id: 'kid', name: 'Asha', age: 9, day: 'school' },
        ],
        current: 'me',
      }),
    );
    render(
      <MemoryRouter>
        <AssistantFab source={localAssistant} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    const box = screen.getByRole('textbox', { name: 'Your message' });
    await userEvent.type(box, 'Asha took a walk in the park for 40 minutes{enter}');
    const reply = await screen.findByText(/^Added to Asha’s day/u);
    expect(reply).toHaveTextContent('40 minutes');
    const saved = JSON.parse(window.localStorage.getItem('vayu.outings.v1') ?? '{}') as Record<
      string,
      { minutes: number }[]
    >;
    expect(saved.kid?.[0]?.minutes).toBe(40);
    await userEvent.type(box, 'Asha went for a walk in the park{enter}');
    expect(await screen.findByText(/For how long was Asha outside/u)).toBeInTheDocument();
    expect(saved.kid).toHaveLength(1);
  });
});
