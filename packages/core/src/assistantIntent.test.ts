import type { AssistantContext } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { answerFromRules } from './assistantRules';

const base: AssistantContext = {
  place: 'Home',
  aqi: 158,
  level: 'Unhealthy',
  pm25: 66,
  best: { span: '3 to 4 pm', aqi: 136 },
  grapStage: 0,
  alerts: [],
  fires: 12,
  people: [{ name: 'Asha', age: 9, day: 'school' }],
  basis: 'From a monitor',
};

const intentOf = (question: string): string | undefined => answerFromRules(question, base).intent;

describe('which rule answers a question', () => {
  it('sends a question about a mask to the mask rule, even when it mentions a kid or outside', () => {
    expect(intentOf('Should my kid wear a mask outside?')).toBe('mask');
    expect(intentOf('Do the children need an N95 at school?')).toBe('mask');
  });

  it('does not find a word inside another: "urban" is not "ban", "spark" is not "park"', () => {
    expect(intentOf('windows open in this urban smog?')).toBe('windows');
    expect(intentOf('what is an urban heat island')).toBeUndefined();
    expect(intentOf('a spark of hope')).toBeUndefined();
    expect(intentOf('What is the school ban on sport?')).toBe('school');
    expect(intentOf('Is there a ban in force?')).toBe('alerts');
  });

  it('understands the usual Hindi typed in Latin letters', () => {
    expect(intentOf('aaj bahar jaana theek hai?')).toBe('walk');
    expect(intentOf('aaj ghumne jaana theek hai')).toBe('walk');
    expect(intentOf('bachon ko bahar khelne bhej sakte hain?')).toBe('school');
    expect(intentOf('khidki khuli rakhu?')).toBe('windows');
    expect(intentOf('maask pehnu kya')).toBe('mask');
  });

  it('keeps the ordinary questions where they were', () => {
    expect(intentOf('When can I go for a walk?')).toBe('walk');
    expect(intentOf('Is school safe today?')).toBe('school');
    expect(intentOf('Can the kids play outside today?')).toBe('school');
    expect(intentOf('What alerts are coming?')).toBe('alerts');
    expect(intentOf('Are there stubble fires near me?')).toBe('fires');
  });
});
