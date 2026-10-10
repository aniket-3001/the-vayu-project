/**
 * Smoke check against the deployed API (08.2). Read-only GETs; nothing is written or sent.
 *
 *   npx tsx tests/smoke/live.ts [apiBaseUrl]
 *
 * Exits 1 if any rule from `invariants.ts` fails on a real response, so it can gate a demo.
 */
import { DEMO_PLACES, Timeline } from '@vayu/contracts';
import {
  checkError,
  checkFires,
  checkReplayTimeline,
  checkRoom,
  checkTimeline,
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

  out(failures === 0 ? '\nAll checks passed.' : `\n${failures} problem(s).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
