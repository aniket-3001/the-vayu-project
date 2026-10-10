import type { Answer, AssistantContext, AssistantSource } from './types';

const BASIS = 'From the sample data in this prototype';

/** Words for a level, for sentences that begin with one. */
const bad = (c: AssistantContext): boolean => c.aqi >= 151;

function walk(c: AssistantContext): string {
  if (c.best === undefined) {
    return `No clean hour outside today at ${c.place}. If you can stay in, do, and move any exercise indoors.`;
  }
  if (c.best.aqi <= 100) {
    return `A good hour for a walk: ${c.best.span}. Air stays near AQI ${String(c.best.aqi)} then. Right now it is AQI ${String(c.aqi)}.`;
  }
  if (c.best.aqi <= 150) {
    return `The cleanest hour is ${c.best.span}, at AQI ${String(c.best.aqi)}. Keep the walk short, and skip it if you are sensitive to air pollution.`;
  }
  return `No clean hour outside today at ${c.place}. The best is ${c.best.span}, still AQI ${String(c.best.aqi)}. If you can stay in, do.`;
}

function school(c: AssistantContext): string {
  const kids = c.people.filter((p) => p.age < 18).map((p) => p.name);
  const who =
    kids.length > 0 ? `${kids.join(' and ')} ${kids.length > 1 ? 'are' : 'is'} on your list. ` : '';
  if (c.grapStage >= 3) {
    return `${who}AQI ${String(c.aqi)} points to GRAP Stage ${String(c.grapStage)} by our estimate, which is unofficial. At this level children should stay indoors, with windows shut and no outdoor play. Follow the school's notice and the official GRAP order at caqm.nic.in. In an emergency, call 112.`;
  }
  if (bad(c)) {
    return `${who}AQI ${String(c.aqi)} is ${c.level.toLowerCase()}. Outdoor play, assembly and PE are better moved indoors today. A well-fitted N95 or FFP2 mask helps on the way to school. This is our estimate, not a school order.`;
  }
  return `${who}AQI ${String(c.aqi)} is ${c.level.toLowerCase()}. School is fine from the air's side. ${c.best !== undefined ? `Outdoor time is best at ${c.best.span}.` : ''}`.trim();
}

function mask(c: AssistantContext): string {
  if (c.aqi >= 151)
    return `Yes. At AQI ${String(c.aqi)}, wear a well-fitted N95 or FFP2 outside. A cloth or surgical mask does little against fine particles.`;
  if (c.aqi >= 101)
    return `Only if you are sensitive to air pollution. At AQI ${String(c.aqi)}, others can go without.`;
  return `No. At AQI ${String(c.aqi)}, the air is ${c.level.toLowerCase()}.`;
}

function windows(c: AssistantContext): string {
  if (c.aqi >= 101)
    return `Keep the windows shut. Outside is AQI ${String(c.aqi)}, worse than most rooms. A purifier on high helps if you have one.`;
  return `Open them. Outside is AQI ${String(c.aqi)}, ${c.level.toLowerCase()}. ${c.best !== undefined ? `Ten minutes at ${c.best.span} is the best time.` : ''}`.trim();
}

function alerts(c: AssistantContext): string {
  if (c.alerts.length === 0) return `Nothing to warn about for the next three days at ${c.place}.`;
  return `For the next three days: ${c.alerts.join('; ')}. These are our estimates, not orders; official orders come first.`;
}

function fires(c: AssistantContext): string {
  if (c.fires === undefined)
    return 'We could not read the fire count just now, so there is nothing to say about stubble burning.';
  return `${String(c.fires)} fires were seen by satellite in the last 24 hours. ${c.fires >= 50 ? 'That is heavy, and smoke can reach Delhi within a day or two: keep windows shut and use the Contact authorities button on the alert to report burning.' : 'That is not heavy.'}`;
}

function smoke(c: AssistantContext): string {
  const n = Math.round((c.pm25 / 22) * 10) / 10;
  return `A day at ${c.place}'s air, PM2.5 ${String(c.pm25)} µg/m³, is about ${String(n)} cigarettes. It is a rule of thumb from Berkeley Earth, to make the number easier to feel. It is not a medical measure.`;
}

function fallback(c: AssistantContext): string {
  return `Right now ${c.place} is at AQI ${String(c.aqi)}, ${c.level.toLowerCase()}. Ask about a walk, school, masks, windows, alerts, stubble burning or the smoking equivalent.`;
}

const INTENTS: readonly { readonly test: RegExp; readonly say: (c: AssistantContext) => string }[] =
  [
    { test: /school|class|child|kid|assembly|\bpe\b|emergenc|principal/iu, say: school },
    { test: /grap|alert|warning|stage|ban/iu, say: alerts },
    { test: /stubble|burn|fire|farm|authorit/iu, say: fires },
    { test: /cigarette|smok/iu, say: smoke },
    { test: /mask|n95|ffp2|respirator/iu, say: mask },
    { test: /window|purifier|ventilat|air the room|open the/iu, say: windows },
    {
      test: /walk|jog|run|exercis|outdoor|outside|play|park|cycl|go out|when can|best time|morning|evening/iu,
      say: walk,
    },
  ];

/** Answers from the app's own data, in plain words. Stands in for Amazon Bedrock until that is wired up. */
export const localAssistant: AssistantSource = {
  ask(question, context): Promise<Answer> {
    const intent = INTENTS.find((i) => i.test.test(question));
    return Promise.resolve({ text: (intent?.say ?? fallback)(context), basis: BASIS });
  },
};
