import type { AssistantContext } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { answerFromRules } from './assistantRules';
import { levelHindi, spanHindi } from './assistantRulesHi';
import { walkAdviceFor, walkAdviceHindi } from './walkAdvice';

const base: AssistantContext = {
  place: 'Home',
  aqi: 162,
  level: 'Unhealthy',
  pm25: 66,
  best: { span: '3 to 4 pm', aqi: 120 },
  grapStage: 0,
  alerts: ['Smog likely Tue'],
  alertsHi: ['मंगलवार को स्मॉग की संभावना'],
  fires: 14,
  people: [{ name: 'Asha', age: 9, day: 'school' }],
  basis: 'From a monitor',
};

const DEVANAGARI = /[ऀ-ॿ]/u;

describe('the assistant in Hindi', () => {
  it('answers every kind of question in Hindi, with the same numbers as in English', () => {
    const cases: readonly [string, string][] = [
      ['When can I go for a walk?', 'सैर'],
      ['Is school safe today?', 'स्कूल'],
      ['Do I need a mask?', 'मास्क'],
      ['Should I open the windows?', 'खिड़कियाँ'],
      ['What alerts are coming?', 'चेतावनियाँ'],
      ['How many fires near me, stubble burning?', 'आग'],
      ['How many cigarettes is this?', 'सिगरेट'],
      ['hello there', 'एक्यूआई'],
    ];
    for (const [question, word] of cases) {
      const hi = answerFromRules(question, base, 'hi');
      const en = answerFromRules(question, base, 'en');
      expect(hi.intent, question).toBe(en.intent);
      expect(DEVANAGARI.test(hi.text), question).toBe(true);
      expect(hi.text, question).toContain(word);
      // Every number in the English answer is in the Hindi one.
      for (const n of en.text.match(/\d+(?:\.\d+)?/gu) ?? [])
        if (Number(n) !== 3 && Number(n) !== 4) expect(hi.text, question).toContain(n);
    }
  });

  it('understands the question in Hindi and in Hindi typed in Latin letters', () => {
    const asks: readonly [string, string][] = [
      ['आज टहलने कब जा सकता हूँ?', 'walk'],
      ['क्या आज स्कूल सुरक्षित है?', 'school'],
      ['क्या मुझे मास्क चाहिए?', 'mask'],
      ['खिड़कियाँ खोलूँ?', 'windows'],
      ['कौन सी चेतावनी आ रही है', 'alerts'],
      ['पराली जलने का क्या हाल है', 'fires'],
      ['aaj sair ke liye kab jaun', 'walk'],
      ['khidki khol doon kya', 'windows'],
    ];
    for (const [question, intent] of asks)
      expect(answerFromRules(question, base, 'hi').intent, question).toBe(intent);
  });

  it('says a GRAP stage is our unofficial estimate and points to the official order', () => {
    const stage = { ...base, grapStage: 4, aqi: 357 };
    const walk = answerFromRules('walk', stage, 'hi').text;
    expect(walk).toContain('अनौपचारिक');
    expect(walk).toContain('आधिकारिक');
    expect(walk).toContain('घर के अंदर');
    const school = answerFromRules('school', stage, 'hi').text;
    expect(school).toContain('caqm.nic.in');
    expect(school).toContain('112');
    expect(school).toContain('अनौपचारिक');
  });

  it('puts the cleanest hour in Hindi, with its period of the day', () => {
    expect(spanHindi('3 to 4 pm')).toBe('दोपहर 3 से 4 बजे');
    expect(spanHindi('5 to 6 pm')).toBe('शाम 5 से 6 बजे');
    expect(spanHindi('11 am to 12 pm')).toBe('सुबह 11 से 12 बजे');
    expect(spanHindi('8 to 9 am tomorrow')).toBe('कल सुबह 8 से 9 बजे');
    expect(spanHindi('late afternoon')).toBe('late afternoon');
    expect(answerFromRules('walk', base, 'hi').text).toContain('दोपहर 3 से 4 बजे');
  });

  it('names each level in Hindi and gives walking advice for every band', () => {
    for (const level of [
      'Good',
      'Moderate',
      'Unhealthy for sensitive groups',
      'Unhealthy',
      'Very unhealthy',
      'Hazardous',
    ])
      expect(DEVANAGARI.test(levelHindi(level))).toBe(true);
    for (const aqi of [20, 80, 130, 180, 300]) {
      expect(walkAdviceHindi(aqi).long.length).toBeGreaterThan(20);
      expect(DEVANAGARI.test(walkAdviceHindi(aqi).long)).toBe(true);
      // The bands line up with the English ones: a bad air band mentions the mask in both.
      expect(walkAdviceFor(aqi).long.includes('N95')).toBe(
        walkAdviceHindi(aqi).long.includes('N95'),
      );
    }
  });

  it('uses the English alerts when the Hindi ones are missing, and never answers English in English mode with Hindi', () => {
    const noHi = { ...base, alertsHi: undefined };
    expect(answerFromRules('alerts', noHi, 'hi').text).toContain('Smog likely Tue');
    expect(DEVANAGARI.test(answerFromRules('alerts', base, 'en').text)).toBe(false);
  });
});
