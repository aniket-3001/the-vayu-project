/**
 * Smoke check against the deployed app (08.2). Read-only, with two exceptions that write nothing: one question to the
 * assistant, and requests that are refused for being invalid. Nothing is stored and nothing is sent to anyone.
 *
 *   npx tsx tests/smoke/live.ts [baseUrl]
 *
 * `baseUrl` is the public site (`https://....cloudfront.net`), where the API is under `/v1`, or the API's own address.
 * Exits 1 if any rule from `invariants.ts` fails on a real response, so it can gate a demo.
 */
import { AssistantReply, DEMO_PLACES, History, Stations, Timeline, Today } from '@vayu/contracts';
import {
  checkError,
  checkFires,
  checkHistory,
  checkReplayTimeline,
  checkRoom,
  checkSecurityHeaders,
  checkStations,
  checkTimeline,
  checkToday,
} from './invariants';

const BASE = (process.argv[2] ?? 'https://niu33luxo8.execute-api.ap-south-1.amazonaws.com').replace(
  /\/$/,
  '',
);

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  const body: unknown = await res.json();
  return { status: res.status, body };
}

async function postJson(
  path: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main(): Promise<void> {
  let failures = 0;
  const report = (name: string, problems: readonly string[], note = ''): void => {
    failures += problems.length;
    out(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${name}${note === '' ? '' : `  (${note})`}`);
    for (const problem of problems) out(`        - ${problem}`);
  };

  const health = await getJson('/v1/health');
  report(
    'health',
    health.status === 200 ? [] : [`status ${health.status}`],
    JSON.stringify(health.body),
  );

  for (const place of DEMO_PLACES) {
    const { status, body } = await getJson(`/v1/timeline?place=${place.id}`);
    if (status !== 200) {
      report(`timeline ${place.id}`, [`status ${status}`]);
      continue;
    }
    const parsed = Timeline.safeParse(body);
    if (!parsed.success) {
      report(`timeline ${place.id}`, ['response does not satisfy the Timeline contract']);
      continue;
    }
    const t = parsed.data;
    report(
      `timeline ${place.id}`,
      checkTimeline(t),
      t.mode === 'live'
        ? `live, ${t.prov.stationName ?? '?'}, ${t.hours.length} hours`
        : 'model fallback',
    );
  }

  const fires = await getJson('/v1/fires');
  report('fires', fires.status === 200 ? checkFires(fires.body) : [`status ${fires.status}`]);

  const unknown = await getJson('/v1/timeline?place=moon');
  report(
    'unknown place',
    unknown.status === 404 ? checkError(unknown.body) : [`expected 404, got ${unknown.status}`],
  );

  // Replay: the prepared weeks, then the same instant asked three ways through the week.
  const weeks = await getJson('/v1/replay/weeks');
  const week = (weeks.body as { weeks?: { weekId: string; start: string; end: string }[] })
    .weeks?.[0];
  if (weeks.status !== 200) {
    report('replay weeks', [`status ${weeks.status}`]);
  } else if (week === undefined) {
    report('replay weeks', [], 'none prepared');
  } else {
    report('replay weeks', [], `${week.weekId}: ${week.start} to ${week.end}`);
    const span = new Date(week.end).getTime() - new Date(week.start).getTime();
    for (const share of [0.1, 0.5, 0.9]) {
      const asOf = new Date(new Date(week.start).getTime() + span * share).toISOString();
      const { status, body } = await getJson(
        `/v1/replay?week=${week.weekId}&place=home&asOf=${encodeURIComponent(asOf)}`,
      );
      const parsed = status === 200 ? Timeline.safeParse(body) : undefined;
      report(
        `replay home at ${Math.round(share * 100)}% of the week`,
        status !== 200
          ? [`status ${status}`]
          : parsed?.success === true
            ? checkReplayTimeline(parsed.data, week)
            : ['response does not satisfy the Timeline contract'],
      );
    }
    const outside = await getJson(
      `/v1/replay?week=${week.weekId}&place=home&asOf=2020-01-01T00:00:00Z`,
    );
    report(
      'replay refuses a time outside the week',
      outside.status === 400 ? checkError(outside.body) : [`expected 400, got ${outside.status}`],
    );
  }

  // What the app itself reads.
  const where = [
    ...DEMO_PLACES.map((p) => ({ name: p.id, query: `place=${p.id}` })),
    { name: 'a place in Noida', query: 'lat=28.57&lng=77.32' },
    { name: 'a place in Lucknow', query: 'lat=26.85&lng=80.95' },
  ];
  for (const place of where) {
    const today = await getJson(`/v1/today?${place.query}`);
    const parsed = today.status === 200 ? Today.safeParse(today.body) : undefined;
    report(
      `today, ${place.name}`,
      today.status !== 200
        ? [`status ${today.status}`]
        : parsed?.success === true
          ? checkToday(parsed.data)
          : ['response does not satisfy the Today contract'],
      parsed?.success === true
        ? `${parsed.data.mode}, ${parsed.data.prov.stationName ?? 'regional model'}, ${parsed.data.prov.ageMinutes} min old`
        : '',
    );
  }
  const history = await getJson('/v1/history?lat=28.59&lng=77.05&days=14');
  const parsedHistory = history.status === 200 ? History.safeParse(history.body) : undefined;
  report(
    'history, 14 days',
    history.status !== 200
      ? [`status ${history.status}`]
      : parsedHistory?.success === true
        ? checkHistory(parsedHistory.data)
        : ['response does not satisfy the History contract'],
    parsedHistory?.success === true ? `${parsedHistory.data.hours.length} hours` : '',
  );
  report(
    'history, bad days',
    (await getJson('/v1/history?lat=28.59&lng=77.05&days=99')).status === 400
      ? []
      : ['expected 400'],
  );
  report(
    'today, outside north India',
    (await getJson('/v1/today?lat=48.8&lng=2.3')).status === 400 ? [] : ['expected 400'],
  );
  const stations = await getJson('/v1/stations');
  const parsedStations = stations.status === 200 ? Stations.safeParse(stations.body) : undefined;
  report(
    'monitors for the map',
    stations.status !== 200
      ? [`status ${stations.status}`]
      : parsedStations?.success === true
        ? checkStations(parsedStations.data)
        : ['response does not satisfy the Stations contract'],
    parsedStations?.success === true ? `${parsedStations.data.stations.length} monitors` : '',
  );

  // The assistant: one real question, and the ways it must say no.
  const ask = await postJson('/v1/assistant', {
    question: 'Do I need a mask?',
    context: {
      place: 'Smoke test',
      aqi: 158,
      level: 'Unhealthy',
      pm25: 65,
      grapStage: 0,
      alerts: [],
      people: [],
      basis: 'From a smoke test',
    },
  });
  if (ask.status === 503 || ask.status === 429) {
    report('assistant', [], `answered ${ask.status}: switched off or at its limit, as designed`);
  } else {
    const reply = ask.status === 200 ? AssistantReply.safeParse(ask.body) : undefined;
    report(
      'assistant answers from the facts it was given',
      ask.status !== 200
        ? [`status ${ask.status}`]
        : reply?.success !== true
          ? ['response does not satisfy the AssistantReply contract']
          : [
              ...(reply.data.text.includes('N95')
                ? []
                : ['the answer does not give the mask rule']),
              ...(reply.data.basis.includes('smoke test')
                ? []
                : ['the answer does not say where its numbers came from']),
            ],
      reply?.success === true ? reply.data.source : '',
    );
  }
  report(
    'assistant refuses a made-up fact outside its limits',
    (await postJson('/v1/assistant', { question: 'x', context: { aqi: 9000 } })).status === 400
      ? []
      : ['expected 400'],
  );
  report(
    'assistant takes only a POST',
    (await getJson('/v1/assistant')).status === 405 ? [] : ['expected 405'],
  );
  // The voice: only what must be refused is tried here, so the check costs nothing and speaks nothing.
  const tooLong = await postJson('/v1/speech', { text: 'x'.repeat(401) });
  const empty = await postJson('/v1/speech', { text: '' });
  report(
    'speech refuses empty words and more than 400 characters',
    tooLong.status === 400 && empty.status === 400
      ? []
      : [`expected 400 and 400, got ${String(tooLong.status)} and ${String(empty.status)}`],
  );
  report(
    'speech takes only a POST',
    (await getJson('/v1/speech')).status === 405 ? [] : ['expected 405'],
  );
  report(
    'requests refuse an invalid form, and store nothing',
    (await postJson('/v1/requests', { who: 'school', name: '' })).status === 400
      ? []
      : ['expected 400'],
  );

  report(
    'fire reports refuse a place that is not on Earth, and store nothing',
    (await postJson('/v1/fire-reports', { lat: 200, lng: 0 })).status === 400
      ? []
      : ['expected 400'],
  );

  // The site itself, when this is the public address.
  if (BASE.includes('cloudfront.net') || process.env.SITE === '1') {
    const page = await fetch(`${BASE}/`);
    const html = await page.text();
    report(
      'the app is served',
      page.status === 200 && html.includes('id="root"')
        ? []
        : [`status ${page.status}, no app root`],
    );
    report('security headers on the page', checkSecurityHeaders(page.headers));
    const viaSite = await fetch(`${BASE}/v1/today?place=home`);
    report('security headers on the API under it', checkSecurityHeaders(viaSite.headers));
    report(
      'the API says how long an answer may be kept',
      /max-age=\d+/u.test(viaSite.headers.get('cache-control') ?? '')
        ? []
        : ['no cache-control on /v1/today'],
    );
    await fetch(`${BASE}/v1/today?place=park`);
    const again = await fetch(`${BASE}/v1/today?place=park`);
    report(
      'CloudFront keeps a repeat answer',
      /hit/iu.test(again.headers.get('x-cache') ?? '')
        ? []
        : [`x-cache: ${again.headers.get('x-cache') ?? 'none'}`],
    );
  }

  // Rooms: a unit that has never reported is "unknown", never a made-up number.
  const room = await getJson('/v1/rooms/smoke-check-unit-never-seen');
  report(
    'room, unit never seen',
    room.status === 200 ? checkRoom(room.body) : [`status ${room.status}`],
  );
  const badRoom = await getJson('/v1/rooms/a%23b');
  report(
    'room, bad name',
    badRoom.status === 400 ? checkError(badRoom.body) : [`expected 400, got ${badRoom.status}`],
  );

  // Accounts: the app is told which sign-in service to use (or that there is none), and a person's own data refuses
  // anyone without a valid token: no token, and a made-up one. Neither check signs anyone in.
  const authConfig = await getJson('/v1/auth-config');
  const cfg = authConfig.body as {
    enabled?: boolean;
    userPoolId?: string;
    clientId?: string;
  } | null;
  report(
    'sign-in config',
    authConfig.status !== 200
      ? [`status ${authConfig.status}`]
      : cfg?.enabled === false ||
          (cfg?.enabled === true && cfg.userPoolId !== undefined && cfg.clientId !== undefined)
        ? []
        : ['neither {"enabled": false} nor the pool and client ids'],
    cfg?.enabled === true ? 'on' : 'off',
  );
  if (cfg?.enabled === true) {
    const noToken = await fetch(`${BASE}/v1/me`);
    report(
      'saved account refuses a caller with no token',
      noToken.status === 401 ? [] : [`expected 401, got ${noToken.status}`],
    );
    const madeUp = await fetch(`${BASE}/v1/me`, {
      method: 'PUT',
      headers: { authorization: 'Bearer not.a.real.token', 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { 'vayu.pins.v1': '[]' } }),
    });
    report(
      'saved account refuses a made-up token',
      madeUp.status === 401 ? [] : [`expected 401, got ${madeUp.status}`],
    );
  }

  out(failures === 0 ? '\nAll checks passed.' : `\n${failures} problem(s).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
