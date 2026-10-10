export const REQUESTS_STORAGE_KEY = 'vayu.requests.v1';

export const WHO = ['school', 'society', 'person'] as const;
export type Who = (typeof WHO)[number];

export const WHO_LABELS: Readonly<Record<Who, string>> = {
  school: 'A school',
  society: 'A housing society',
  person: 'A person or family',
};

export const WANTS = ['demo', 'monitors'] as const;
export type Want = (typeof WANTS)[number];

export const WANT_LABELS: Readonly<Record<Want, string>> = {
  demo: 'A demo of Vayu',
  monitors: 'Air monitors at our place',
};

/** What someone tells us when they ask for a demo or for monitors. Only what is needed to get back to them. */
export interface Request {
  readonly who: Who;
  readonly name: string;
  /** The school or society, when it is one. */
  readonly organisation: string;
  readonly area: string;
  /** An email address or an Indian mobile number. */
  readonly contact: string;
  readonly wants: readonly Want[];
  /** How many rooms or homes, when they know. */
  readonly places: string;
  readonly sentAt: string;
}

export type Draft = Omit<Request, 'sentAt'>;

export const EMPTY_DRAFT: Draft = {
  who: 'school',
  name: '',
  organisation: '',
  area: '',
  contact: '',
  wants: ['demo'],
  places: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const MOBILE = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/u;

export const isContact = (value: string): boolean =>
  EMAIL.test(value.trim()) || MOBILE.test(value.replace(/[\s-]/gu, ''));

/** What is wrong with the form, in words a person can act on. Empty when it is fine to send. */
export function problemsWith(draft: Draft): readonly string[] {
  const problems: string[] = [];
  if (draft.name.trim() === '') problems.push('Please tell us your name.');
  if (draft.who !== 'person' && draft.organisation.trim() === '')
    problems.push(
      draft.who === 'school'
        ? 'Please tell us the school’s name.'
        : 'Please tell us the society’s name.',
    );
  if (draft.area.trim() === '') problems.push('Please tell us the area or city.');
  if (!isContact(draft.contact))
    problems.push('Please give an email address or a 10-digit mobile number we can reach you on.');
  if (draft.wants.length === 0)
    problems.push('Please pick what you would like: a demo, monitors, or both.');
  return problems;
}

export type Sent = 'sent' | 'saved';

/**
 * Sends the request to our API when one is set (`POST {base}/v1/requests`). That endpoint is not deployed yet,
 * so without it, or if it fails, the request is kept on this device only, and the screen says so.
 */
export async function submitRequest(
  draft: Draft,
  options: {
    readonly baseUrl?: string | undefined;
    readonly fetchImpl?: typeof fetch;
    readonly storage?: Storage;
    readonly now?: () => Date;
  } = {},
): Promise<Sent> {
  const request: Request = {
    ...draft,
    sentAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  const base = options.baseUrl;
  if (base !== undefined && base !== '') {
    try {
      const res = await (options.fetchImpl ?? fetch)(`${base.replace(/\/$/u, '')}/v1/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (res.ok) return 'sent';
    } catch {
      // Fall through to keeping it on this device.
    }
  }
  try {
    const storage = options.storage ?? window.localStorage;
    const raw = storage.getItem(REQUESTS_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    const kept: readonly unknown[] = Array.isArray(parsed) ? (parsed as unknown[]) : [];
    storage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify([...kept, request]));
  } catch {
    // Best effort.
  }
  return 'saved';
}
