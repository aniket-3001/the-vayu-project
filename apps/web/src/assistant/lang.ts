/** The language the assistant speaks and listens in: English (Indian), or Hindi. */
export type Lang = 'en' | 'hi';

export const LANG_STORAGE_KEY = 'vayu.assistant.lang.v1';

/** The language last chosen on this device, English if none or if storage is not available. */
export function loadLang(storage: Storage | undefined = safeStorage()): Lang {
  try {
    return storage?.getItem(LANG_STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLang(lang: Lang, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Best effort: it still holds for this visit.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The speech language tag for each: what the browser's recogniser and voice are asked for. */
export const SPEECH_TAG: Readonly<Record<Lang, string>> = { en: 'en-IN', hi: 'hi-IN' };

const ASCII_DIGITS = '0123456789';
/** Hindi (Devanagari) digits to the digits we read, so "४० मिनट" is "40 मिनट". */
export const asciiDigits = (text: string): string =>
  text.replace(/[०-९]/gu, (d) => ASCII_DIGITS.charAt(d.charCodeAt(0) - 0x0966));

const WORD_NUMBERS: readonly (readonly [string, number])[] = [
  ['पैंतालीस', 45],
  ['पचास', 50],
  ['चालीस', 40],
  ['पैंतीस', 35],
  ['पच्चीस', 25],
  ['पंद्रह', 15],
  ['पन्द्रह', 15],
  ['बीस', 20],
  ['तीस', 30],
  ['साठ', 60],
  ['दस', 10],
  ['पाँच', 5],
  ['पांच', 5],
];

/** How long, in minutes, from Hindi words: "40 मिनट", "आधा घंटा", "डेढ़ घंटे", "पंद्रह मिनट", "1 घंटा 20 मिनट". */
export function minutesInHindi(raw: string): number | undefined {
  const t = asciiDigits(raw);
  let total = 0;
  let found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:घंटे|घंटा|घण्टे|घण्टा|घन्टा|घन्टे)/gu)) {
    total += Number(m[1]) * 60;
    found = true;
  }
  for (const m of t.matchAll(/(\d+)\s*(?:मिनट|मिनिट)/gu)) {
    total += Number(m[1]);
    found = true;
  }
  if (found) return Math.round(total);
  for (const [word, n] of WORD_NUMBERS)
    if (new RegExp(`${word}\\s*(?:मिनट|मिनिट)`, 'u').test(t)) return n;
  if (/डेढ़\s*घं/u.test(t)) return 90;
  if (/ढाई\s*घं/u.test(t)) return 150;
  if (/पौन\s*घं/u.test(t)) return 45;
  if (/आधा\s*घं|आधे\s*घं/u.test(t)) return 30;
  if (/(?:एक|1)\s*घं/u.test(t)) return 60;
  if (/दो\s*घं/u.test(t)) return 120;
  return undefined;
}

/** Whether the text is mostly Devanagari: a person typing in Hindi. */
export const looksHindi = (text: string): boolean => /[ऀ-ॿ]/u.test(text);

/**
 * The small print under an answer, in Hindi: where the numbers came from. The few forms the app writes are put into
 * Hindi word for word; anything else is left as it is.
 */
export function basisHindi(basis: string): string {
  return basis
    .replace(/^From the sample data in this prototype/u, 'इस प्रोटोटाइप के नमूना डेटा से')
    .replace(
      /^From the regional air model, since no monitor near here has reported lately/u,
      'क्षेत्रीय वायु मॉडल से, क्योंकि पास के किसी मॉनिटर ने हाल में रिपोर्ट नहीं की',
    )
    .replace(
      /^From (.+?), ([\d.]+) km away, (\d+) (minutes|hours) old/u,
      (_all, station: string, km: string, age: string, unit: string) =>
        `${station} से, ${km} किमी दूर, ${age} ${unit === 'hours' ? 'घंटे' : 'मिनट'} पुरानी रीडिंग`,
    )
    .replace(/\. Answered by the app’s own rules: .*$/u, '। ऐप के अपने नियमों से जवाब दिया गया।')
    .replace(/\. Wording by AI.*$/u, '।');
}
