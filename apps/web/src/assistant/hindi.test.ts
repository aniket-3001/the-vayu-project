// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Person } from '../exposure/people';
import { today } from '../exposure/model';
import {
  asciiDigits,
  basisHindi,
  loadLang,
  LANG_STORAGE_KEY,
  minutesInHindi,
  saveLang,
} from './lang';
import { isFireReport, isSendIt, placeFromText } from './fireReporting';
import { isOutdoorStatement, nextStep, readInto, startDraft, whoIs } from './logging';
import { addedText, minutesIn } from './outingParse';
import { WORDS } from './strings';

beforeEach(() => {
  window.localStorage.clear();
});

const me: Person = { id: 'me', name: 'Me', age: 30, day: 'work' };
const asha: Person = { id: 'asha', name: 'Asha', age: 9, day: 'school' };
const ashaHi: Person = { ...asha, name: 'आशा' };
const people = [me, ashaHi];
const pins = [
  { id: 'p', name: 'Park', lat: 28.5, lng: 77.1 },
  { id: 'h', name: 'Home', lat: 28.6, lng: 77.2 },
];
const now = { date: today(), minutes: 18 * 60 };

describe('the language choice', () => {
  it('is English until Hindi is chosen, and is kept on the device', () => {
    expect(loadLang()).toBe('en');
    saveLang('hi');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('hi');
    expect(loadLang()).toBe('hi');
    saveLang('en');
    expect(loadLang()).toBe('en');
  });

  it('has the same words in both languages', () => {
    for (const [key, value] of Object.entries(WORDS.en)) {
      const other = (WORDS.hi as unknown as Record<string, unknown>)[key];
      expect(typeof other, key).toBe(typeof value);
    }
    expect(WORDS.hi.suggestions).toHaveLength(WORDS.en.suggestions.length);
  });
});

describe('lengths of time in Hindi', () => {
  it('reads minutes, hours, half an hour and Hindi digits', () => {
    expect(minutesInHindi('40 मिनट')).toBe(40);
    expect(minutesInHindi('४० मिनट टहला')).toBe(40);
    expect(minutesInHindi('1 घंटा 20 मिनट')).toBe(80);
    expect(minutesInHindi('आधा घंटा')).toBe(30);
    expect(minutesInHindi('डेढ़ घंटे')).toBe(90);
    expect(minutesInHindi('पंद्रह मिनट')).toBe(15);
    expect(minutesInHindi('बस टहला')).toBeUndefined();
    expect(minutesIn('आशा ने 25 मिनट टहला')).toBe(25);
    expect(asciiDigits('१२३')).toBe('123');
  });
});

describe('what someone did outdoors, said in Hindi', () => {
  it('knows a statement from a question', () => {
    expect(isOutdoorStatement('आशा ने पार्क में 40 मिनट टहला')).toBe(true);
    expect(isOutdoorStatement('मैं आज शाम 30 मिनट टहला')).toBe(true);
    expect(isOutdoorStatement('मेरी 30 मिनट की सैर जोड़ दो')).toBe(true);
    expect(isOutdoorStatement('क्या मैं आज टहलने जा सकता हूँ?')).toBe(false);
    expect(isOutdoorStatement('टहलने के लिए सबसे अच्छा समय कब है')).toBe(false);
  });

  it('reads who, what, where and how long into a draft, and asks for what is missing in Hindi', () => {
    const draft = startDraft('आशा ने पार्क में 40 मिनट टहला', people, pins);
    expect(draft).toMatchObject({ personId: 'asha', activity: 'walk', minutes: 40 });
    const step = nextStep(draft ?? { personId: 'asha', date: today() }, people, pins, now, 'hi');
    expect(step.kind).toBe('save');
    // Missing a length: it asks for it in Hindi, with Hindi answers to tap.
    const noLength = startDraft('आशा ने पार्क में टहला', people, pins);
    const ask = nextStep(noLength ?? { personId: 'asha', date: today() }, people, pins, now, 'hi');
    expect(ask.kind).toBe('ask');
    if (ask.kind === 'ask') {
      expect(ask.text).toContain('कितनी देर');
      expect(ask.chips).toContain('30 मिनट');
      // A tapped chip is read as the answer.
      const read = readInto(ask.draft, '30 मिनट', pins);
      expect(read.minutes).toBe(30);
    }
    const none = startDraft('मैं बाहर गया', people, pins);
    const what = nextStep(none ?? { personId: 'me', date: today() }, people, pins, now, 'hi');
    expect(what.kind).toBe('ask');
    if (what.kind === 'ask') expect(what.text).toContain('क्या किया');
  });

  it('finds the place by its Hindi word, and a person by a name written in Devanagari', () => {
    const d = readInto({ personId: 'me', date: today() }, 'घर पर साइकिल चलाई 20 मिनट', pins);
    expect(d).toMatchObject({ activity: 'cycle', where: { role: 'home' }, minutes: 20 });
    const named = whoIs('आशा ने खेला', [me, { ...asha, name: 'आशा' }]);
    expect(named?.id).toBe('asha');
  });

  it('says in Hindi what was added', () => {
    const text = addedText(
      asha,
      {
        date: today(),
        start: 17 * 60,
        minutes: 40,
        activity: 'walk',
        pin: pins[0] ?? { id: 'p', name: 'Park', lat: 0, lng: 0 },
        trees: true,
      },
      'hi',
    );
    expect(text).toContain('Asha के दिन में जोड़ दिया');
    expect(text).toContain('40 मिनट');
    expect(text).toContain('पेड़ों');
  });
});

describe('a fire, said in Hindi', () => {
  it('knows a report from a question', () => {
    expect(isFireReport('मुझे पास में पराली जलती दिख रही है')).toBe(true);
    expect(isFireReport('आग की रिपोर्ट करनी है')).toBe(true);
    expect(isFireReport('पराली जलने का क्या हाल है?')).toBe(false);
    expect(isSendIt('भेजें')).toBe(true);
    expect(isSendIt('कुछ नहीं')).toBe(true);
    expect(placeFromText('मेरे पास', pins)).toBe('here');
    expect(placeFromText('स्कूल के पास', [{ id: 's', name: 'School', lat: 1, lng: 2 }])).toEqual({
      lat: 1,
      lng: 2,
      label: 'School',
    });
  });

  describe('the small print in Hindi', () => {
    it('puts the forms the app writes into Hindi, and leaves anything else', () => {
      expect(basisHindi('From GK1, 4.2 km away, 40 minutes old')).toBe(
        'GK1 से, 4.2 किमी दूर, 40 मिनट पुरानी रीडिंग',
      );
      expect(basisHindi('From GK1, 4.2 km away, 3 hours old. Wording by AI, checked.')).toBe(
        'GK1 से, 4.2 किमी दूर, 3 घंटे पुरानी रीडिंग।',
      );
      expect(basisHindi('From the sample data in this prototype')).toContain('नमूना डेटा');
      expect(basisHindi('Something else')).toBe('Something else');
    });
  });
});
