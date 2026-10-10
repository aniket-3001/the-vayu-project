// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerFromRules } from '@vayu/core';
import { sampleDay } from '../today/sample';
import { apiAssistant } from './api';
import { AssistantFab } from './AssistantFab';
import { spanWords, buildContext } from './context';
import { localAssistant } from './local';
import type { Voice } from './speech';
import type { AssistantContext, AssistantSource } from './types';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
});

const base: AssistantContext = {
  place: 'Home',
  aqi: 158,
  level: 'Unhealthy',
  pm25: 71.3,
  grapStage: 0,
  alerts: ['Avoid park walks today'],
  fires: 127,
  people: [{ name: 'Asha', age: 9, day: 'school' }],
  basis: 'From the sample data in this prototype',
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

  const good = {
    text: 'From Bedrock.',
    basis: 'From GK1. Wording by AI, checked against the facts.',
    source: 'model_reworded',
  };

  it('use what the API says, with its own small print', async () => {
    const answer = await apiAssistant('https://x.test/', reply(good)).ask('hi', base);
    expect(answer).toEqual({ text: 'From Bedrock.', basis: good.basis });
  });

  it('post the question and what the app knows to /v1/assistant', async () => {
    const fetcher = reply(good);
    await apiAssistant('https://x.test/', fetcher).ask('hello', base);
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] ?? ['', {}];
    expect(url).toBe('https://x.test/v1/assistant');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      question: 'hello',
      context: { place: 'Home', basis: base.basis },
    });
  });

  it('answer from the same rules themselves, and say why, when the service is down, off, over its limit or sends rubbish', async () => {
    const cases: [typeof fetch, RegExp][] = [
      [reply({}, 500), /had a problem/u],
      [reply({}, 503), /switched off/u],
      [reply({}, 429), /reached its limit/u],
      [reply({ text: '' }), /could not read/u],
      [reply({ nope: 1 }), /could not read/u],
      [vi.fn(() => Promise.reject(new Error('offline'))), /could not be reached/u],
    ];
    for (const [f, why] of cases) {
      const answer = await apiAssistant('https://x.test', f).ask('do I need a mask', base);
      expect(answer.text).toBe(answerFromRules('do I need a mask', base).text);
      expect(answer.basis).toMatch(why);
      expect(answer.basis).toMatch(/own rules/u);
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
    expect(chat).toHaveTextContent('Answers use made-up air, from fixed rules');
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
      // From the air at the pinned School, not at the first place.
      await screen.findByText(/School is fine|moved indoors|Outdoor play|GRAP Stage/u),
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

  const voiceStub = (): Voice & { said: string[]; stopped: number } => {
    const v = {
      said: [] as string[],
      stopped: 0,
      speak: (text: string): Promise<void> => {
        v.said.push(text);
        return Promise.resolve();
      },
      stop: (): void => {
        v.stopped += 1;
      },
    };
    return v;
  };
  const openWith = (voice: Voice): void => {
    render(
      <MemoryRouter>
        <AssistantFab voice={voice} />
      </MemoryRouter>,
    );
  };

  it('reads every answer aloud as it arrives, like a voice assistant', async () => {
    const voice = voiceStub();
    openWith(voice);
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.click(screen.getByRole('button', { name: 'Do I need a mask?' }));
    expect(await screen.findByText(/well-fitted N95 or FFP2/u)).toBeInTheDocument();
    await waitFor(() => {
      expect(voice.said).toHaveLength(1);
    });
    expect(voice.said[0]).toMatch(/N95 or FFP2/u);
    await userEvent.click(screen.getByRole('button', { name: 'Listen to this answer' }));
    expect(voice.said).toHaveLength(2);
  });

  it('can be muted, and stays muted the next time', async () => {
    const voice = voiceStub();
    openWith(voice);
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    const switchButton = screen.getByRole('button', { name: 'Read answers aloud' });
    expect(switchButton).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(switchButton);
    expect(switchButton).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('vayu.voice.v1')).toBe('off');
    await userEvent.click(screen.getByRole('button', { name: 'Do I need a mask?' }));
    await screen.findByText(/well-fitted N95 or FFP2/u);
    expect(voice.said).toHaveLength(0);
    cleanup();
    openWith(voiceStub());
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    expect(screen.getByRole('button', { name: 'Read answers aloud' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('stops talking when the chat is closed', async () => {
    const voice = voiceStub();
    openWith(voice);
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    const before = voice.stopped;
    await userEvent.keyboard('{Escape}');
    expect(voice.stopped).toBeGreaterThan(before);
  });

  describe('by voice', () => {
    interface FakeRecognition {
      onresult: ((event: { results: unknown[] }) => void) | null;
      onend: (() => void) | null;
      stopped: boolean;
    }
    const instances: FakeRecognition[] = [];
    const current = (): FakeRecognition | undefined => instances.at(-1);
    beforeEach(() => {
      instances.length = 0;
      class Fake implements FakeRecognition {
        onresult: FakeRecognition['onresult'] = null;
        onend: FakeRecognition['onend'] = null;
        onerror: (() => void) | null = null;
        stopped = false;
        lang = '';
        continuous = false;
        interimResults = false;
        constructor() {
          instances.push(this);
        }
        start(): void {
          // Listening begins at once; there is nothing to do.
        }
        stop(): void {
          this.stopped = true;
          this.onend?.();
        }
        abort(): void {
          this.stop();
        }
      }
      vi.stubGlobal('webkitSpeechRecognition', Fake);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });
    const said = (text: string): unknown[] => [[{ transcript: text }]];

    it('shows that it is listening, then the words as they are understood, and sends them', async () => {
      openWith(voiceStub());
      await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
      await userEvent.click(screen.getByRole('button', { name: 'Speak to the assistant' }));
      expect(screen.getByRole('status')).toHaveTextContent('Listening…');
      expect(screen.getByRole('button', { name: 'Stop listening' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      act(() => {
        current()?.onresult?.({ results: said('do I need') });
      });
      expect(screen.getByRole('status')).toHaveTextContent('Transcribing…');
      expect(screen.getByRole('status')).toHaveTextContent('do I need');
      act(() => {
        current()?.onresult?.({ results: said('do I need a mask') });
      });
      expect(screen.getByRole('status')).toHaveTextContent('do I need a mask');
      await userEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
      expect(current()?.stopped).toBe(true);
      expect(await screen.findByText(/well-fitted N95 or FFP2/u)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('lets go of the microphone and sends nothing when cancelled', async () => {
      openWith(voiceStub());
      await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
      await userEvent.click(screen.getByRole('button', { name: 'Speak to the assistant' }));
      act(() => {
        current()?.onresult?.({ results: said('open the windows') });
      });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(current()?.stopped).toBe(true);
      expect(screen.queryByText('open the windows')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('says what to do when nothing is pinned, and closes with Escape', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'walk?{Enter}');
    expect(await screen.findByText(/Add a place on My Air first/u)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('a place pinned while the assistant is already open', () => {
  it('is seen by the assistant at once, and answered from, without reloading', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    const { PINS_CHANGED } = await import('../places/usePins');
    render(
      <MemoryRouter>
        <AssistantFab voice={{ speak: () => Promise.resolve(), stop: () => undefined }} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'mask?{Enter}');
    expect(await screen.findByText(/Add a place on My Air first/u)).toBeInTheDocument();
    // A place is pinned on another screen: storage changes and the change is announced.
    window.localStorage.setItem(
      'vayu.pins.v1',
      JSON.stringify([{ id: '28.59,77.22', name: 'Home', lat: 28.59, lng: 77.22 }]),
    );
    act(() => {
      window.dispatchEvent(new Event(PINS_CHANGED));
    });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Your message' }),
      'Do I need a mask?{Enter}',
    );
    // An answer from the air at the new place, not the help message again.
    expect(
      await screen.findByText(/At AQI \d+/u, { selector: '.bubble.vayu p' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Add a place on My Air first/u)).toHaveLength(1);
  });

  it('speaks even the help message, and offers to read it again', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    const said: string[] = [];
    render(
      <MemoryRouter>
        <AssistantFab
          voice={{
            speak: (text) => {
              said.push(text);
              return Promise.resolve();
            },
            stop: () => undefined,
          }}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello{Enter}');
    await screen.findByText(/Add a place on My Air first/u);
    expect(said.join(' ')).toMatch(/Add a place on My Air first/u);
    expect(screen.getByRole('button', { name: 'Listen to this answer' })).toBeInTheDocument();
  });
});

describe('the best hour in the context', () => {
  it('says tomorrow when the cleanest hour is after midnight', () => {
    const c = buildContext('Home', sampleDay('good'), [], undefined, []);
    expect(c.best?.span).toMatch(/ tomorrow$/u);
  });

  const typeIn = async (words: string): Promise<void> => {
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), `${words}{Enter}`);
  };
  const openChat = async (): Promise<void> => {
    render(
      <MemoryRouter>
        <AssistantFab
          source={localAssistant}
          voice={{ speak: () => Promise.resolve(), stop: () => undefined }}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vayu assistant' }));
  };
  const savedOutings = (): Record<
    string,
    { minutes: number; pin: { name: string }; activity: string }[]
  > =>
    JSON.parse(window.localStorage.getItem('vayu.outings.v1') ?? '{}') as Record<
      string,
      { minutes: number; pin: { name: string }; activity: string }[]
    >;
  const pins = [
    { id: 'h', name: 'Home', lat: 28.59, lng: 77.05 },
    { id: 's', name: 'School', lat: 28.57, lng: 77.18 },
    { id: 'p', name: 'Park', lat: 28.63, lng: 77.22 },
  ];

  it('asks what is missing, one thing at a time: where, then for how long, and then logs it', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify(pins));
    await openChat();
    await typeIn('I took a walk');
    // It does not guess the place from the pinned ones: it asks.
    expect(await screen.findByText(/Where was it/u)).toBeInTheDocument();
    expect(savedOutings().me).toBeUndefined();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Quick answers' })).getByRole('button', {
        name: 'School',
      }),
    );
    expect(await screen.findByText(/For how long, at School/u)).toBeInTheDocument();
    await typeIn('30');
    const reply = await screen.findByText(/^Added to your day/u);
    expect(reply).toHaveTextContent('School');
    expect(reply).toHaveTextContent('30 minutes');
    expect(savedOutings().me?.[0]).toMatchObject({ minutes: 30, activity: 'walk' });
    expect(savedOutings().me?.[0]?.pin.name).toBe('School');
  });

  it('takes all three from one sentence, with no questions', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify(pins));
    await openChat();
    await typeIn('I took a 30 minute walk at home');
    expect(await screen.findByText(/^Added to your day/u)).toBeInTheDocument();
    expect(screen.queryByText(/Where was it|For how long/u)).not.toBeInTheDocument();
    expect(savedOutings().me?.[0]?.pin.name).toBe('Home');
  });

  it('asks what was done when it was only said that someone was outside', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify(pins));
    await openChat();
    await typeIn('I was outside at the park for 20 minutes');
    expect(await screen.findByText(/What did you do outside/u)).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Quick answers' })).getByRole('button', {
        name: 'Play',
      }),
    );
    expect(await screen.findByText(/^Added to your day/u)).toBeInTheDocument();
    expect(savedOutings().me?.[0]).toMatchObject({ activity: 'play', minutes: 20 });
  });

  it('says to add the place first when it was somewhere that is not set, and logs nothing', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify([pins[0]]));
    await openChat();
    await typeIn('I walked at school for 30 minutes');
    expect(await screen.findByText(/no school place set yet/iu)).toBeInTheDocument();
    expect(savedOutings().me).toBeUndefined();
  });

  it('logs for someone on the list by name, and leaves a question about air as a question', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify(pins));
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
    await openChat();
    await typeIn('Asha played in the park for 45 minutes');
    expect(await screen.findByText(/^Added to Asha’s day/u)).toBeInTheDocument();
    expect(savedOutings().kid?.[0]).toMatchObject({ minutes: 45, activity: 'play' });
    await typeIn('Do I need a mask?');
    expect(await screen.findByText(/At AQI \d+/u)).toBeInTheDocument();
  });

  it('answers a question about school by asking for a school first when none is set', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify([pins[0]]));
    await openChat();
    await typeIn('Is school safe today?');
    expect(await screen.findByText(/Add a school on My Air first/u)).toBeInTheDocument();
  });

  it('lets someone back out of a log that is half done', async () => {
    window.localStorage.setItem('vayu.pins.v1', JSON.stringify(pins));
    await openChat();
    await typeIn('I took a walk');
    await screen.findByText(/Where was it/u);
    await typeIn('never mind');
    expect(await screen.findByText(/I left it out/u)).toBeInTheDocument();
    expect(savedOutings().me).toBeUndefined();
  });
});
