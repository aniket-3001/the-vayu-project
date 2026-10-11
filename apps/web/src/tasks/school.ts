import { usAqi } from '@vayu/core';
import { GRAP_GUIDE, ROMAN } from '../alerts/model';
import { assemblyFor } from '../alerts/assembly';
import { levelForAqi } from '../design/levels';
import type { Person } from '../exposure/people';
import { hourName, hourOfDay, isoDate } from '../today/time';
import type { TodayData } from '../today/types';
import { POINTS, grapStageFor, type Task } from './model';

/** A child's usual school hours: the hour they go and the hour they come home, 0 to 24. */
export interface SchoolHours {
  readonly from: number;
  readonly to: number;
}

/**
 * The AQI over a window of the day at a place: the day's hours inside it, from what has been measured and what is
 * forecast. Today's window if it has not ended, otherwise tomorrow's. With no hour in it, the AQI now.
 */
export function aqiOverWindow(data: TodayData, hours: SchoolHours): number {
  const nowHour = hourOfDay(data.asOf);
  const todayKey = isoDate(data.asOf);
  const wantTomorrow = nowHour >= hours.to;
  const inWindow = [...data.history, ...data.hourly].filter((point) => {
    const day = isoDate(point.at);
    const hour = Math.floor(hourOfDay(point.at));
    return (
      (wantTomorrow ? day > todayKey : day === todayKey) && hour >= hours.from && hour < hours.to
    );
  });
  if (inWindow.length === 0) return data.aqi;
  const mean = inWindow.reduce((sum, p) => sum + p.pm25, 0) / inWindow.length;
  return usAqi(mean)?.value ?? data.aqi;
}

/** What to do about a school day at an AQI, in a sentence a parent can act on. */
function adviceForChild(aqi: number, stage: number): string {
  if (stage >= 3)
    return 'Keep them indoors at school, with no play or sport outside. Check the school’s notice and the official order.';
  if (stage === 2 || aqi >= 151)
    return 'Ask for break and sport indoors, and a well-fitted N95 or FFP2 mask for the way there and back.';
  if (stage === 1 || aqi >= 101)
    return 'Keep outdoor play and sport short, and take it easy if they have asthma.';
  return 'Nothing special: the air is fine for school and play.';
}

/**
 * Tips for a school that is part of the day: where the morning assembly should be, what the GRAP stage there
 * means for sport and play, and how each child going there will breathe through their school day. They are for a
 * parent as much as for the student, and are worked out from the school's own air, not from where the phone is.
 */
export function schoolTasksFor(
  data: TodayData,
  school: { readonly name: string; readonly key: string },
  children: readonly { readonly person: Person; readonly hours: SchoolHours }[],
): readonly Task[] {
  const tasks: Task[] = [];
  const assembly = assemblyFor(data);
  tasks.push({
    id: `assembly:${school.key}`,
    kind: 'assembly',
    title: `Morning assembly: ${assembly.label}`,
    why: assembly.words,
    points: POINTS.assembly,
    place: school.name,
  });
  const stage = grapStageFor(data);
  if (stage !== 0) {
    const guide = GRAP_GUIDE[stage];
    tasks.push({
      id: `school-grap:${school.key}`,
      kind: 'school-grap',
      title: `GRAP Stage ${ROMAN[stage]} at school`,
      why: `${guide.short} Our estimate, not an order.`,
      points: POINTS['school-grap'],
      place: school.name,
    });
  }
  for (const { person, hours } of children) {
    const aqi = aqiOverWindow(data, hours);
    const level = levelForAqi(aqi).name.toLowerCase();
    tasks.push({
      id: `child:${school.key}:${person.id}`,
      kind: 'child',
      title: `${person.name}, ${String(person.age)}: AQI ${String(aqi)} at school`,
      why: `${hourName(hours.from)} to ${hourName(hours.to)}, ${level}. ${adviceForChild(aqi, stage)}`,
      points: POINTS.child,
      place: school.name,
    });
  }
  return tasks;
}
