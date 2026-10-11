import type { AssistantContext } from '@vayu/contracts';
import { walkAdviceHindi } from './walkAdvice';

/**
 * The assistant's answers in Hindi. They are the same rules and the same numbers as the English ones, in sentences
 * that were written and read through by a person, with the facts slotted in. Nothing here is machine translation and
 * no model is asked to say it: an answer an elder acts on is only worth giving if every word is one we chose.
 */

const LEVELS_HI: Readonly<Record<string, string>> = {
  Good: 'अच्छी',
  Moderate: 'मध्यम',
  'Unhealthy for sensitive groups': 'संवेदनशील लोगों के लिए अस्वस्थ',
  Unhealthy: 'अस्वस्थ',
  'Very unhealthy': 'बहुत अस्वस्थ',
  Hazardous: 'खतरनाक',
};

/** The level's name in Hindi; an unknown name is left as it came. */
export const levelHindi = (level: string): string => LEVELS_HI[level] ?? level;

const PERIOD = (hour24: number): string =>
  hour24 < 12 ? 'सुबह' : hour24 < 16 ? 'दोपहर' : hour24 < 20 ? 'शाम' : 'रात';

/** "3 to 4 pm" or "11 am to 12 pm", with "tomorrow" if it is on the end: "शाम 3 से 4 बजे", "कल सुबह 11 से 12 बजे". */
export function spanHindi(span: string): string {
  const m = /^(\d{1,2})(?:\s*(am|pm))?\s+to\s+(\d{1,2})\s*(am|pm)(\s+tomorrow)?$/iu.exec(
    span.trim(),
  );
  if (m === null) return span;
  const from = Number(m[1]);
  const to = Number(m[3]);
  const endSuffix = (m[4] ?? 'am').toLowerCase();
  const startSuffix = (m[2] ?? endSuffix).toLowerCase();
  const to24 = (hour: number, suffix: string): number =>
    suffix === 'pm' ? (hour % 12) + 12 : hour % 12;
  const period = PERIOD(to24(from, startSuffix));
  const day = m[5] === undefined ? '' : 'कल ';
  return `${day}${period} ${String(from)} से ${String(to)} बजे`;
}

const grap = (c: AssistantContext): string => `ग्रैप चरण ${String(c.grapStage)}`;

export function walkHindi(c: AssistantContext): string {
  if (c.grapStage >= 1) {
    const stage = `आज ${c.place} में हमारे अनुमान से ${grap(c)} की संभावना है (अनौपचारिक; आधिकारिक आदेश ही मान्य है)।`;
    const outside =
      c.best === undefined
        ? ''
        : ` अगर बाहर जाना ही पड़े तो सबसे साफ़ समय ${spanHindi(c.best.span)} है, एक्यूआई ${String(c.best.aqi)}: ${walkAdviceHindi(c.best.aqi).long}`;
    return `${stage} आज सैर या व्यायाम घर के अंदर करें।${outside}`;
  }
  if (c.best === undefined) {
    return `${c.place} में आगे कोई दिन का साफ़ घंटा नहीं मिला। अभी एक्यूआई ${String(c.aqi)} है, इसलिए बाहर की गतिविधि ज़रूरत भर ही रखें।`;
  }
  const advice = walkAdviceHindi(c.best.aqi);
  const span = spanHindi(c.best.span);
  const lead =
    c.best.aqi <= 100
      ? `सैर के लिए अच्छा समय: ${span}। तब हवा एक्यूआई ${String(c.best.aqi)} के आसपास रहेगी।`
      : `सैर के लिए सबसे साफ़ समय ${span} है, एक्यूआई ${String(c.best.aqi)}।`;
  return `${lead} ${advice.long} अभी एक्यूआई ${String(c.aqi)} है।`;
}

export function schoolHindi(c: AssistantContext): string {
  const kids = c.people.filter((p) => p.age < 18).map((p) => p.name);
  const who =
    kids.length > 0 ? `${kids.join(' और ')} आपकी सूची में ${kids.length > 1 ? 'हैं' : 'है'}। ` : '';
  const level = levelHindi(c.level);
  if (c.grapStage >= 3) {
    return `${who}एक्यूआई ${String(c.aqi)} हमारे अनुमान से ${grap(c)} की ओर इशारा करता है, जो अनौपचारिक है। इस स्तर पर बच्चों को घर के अंदर रखें, खिड़कियाँ बंद रखें और बाहर खेलने न दें। स्कूल की सूचना और caqm.nic.in पर आधिकारिक ग्रैप आदेश देखें। आपात स्थिति में 112 पर कॉल करें।`;
  }
  if (c.aqi >= 151) {
    return `${who}एक्यूआई ${String(c.aqi)} है, हवा ${level} है। आज बाहर का खेल, असेंबली और पीटी अंदर कराना बेहतर है। स्कूल आते-जाते समय अच्छी तरह फिट N95 या FFP2 मास्क मदद करता है। यह हमारा अनुमान है, स्कूल का आदेश नहीं।`;
  }
  return `${who}एक्यूआई ${String(c.aqi)} है, हवा ${level} है। हवा की तरफ़ से स्कूल ठीक है।${c.best !== undefined ? ` बाहर का समय ${spanHindi(c.best.span)} सबसे अच्छा है।` : ''}`.trim();
}

export function maskHindi(c: AssistantContext): string {
  if (c.aqi >= 151)
    return `हाँ। एक्यूआई ${String(c.aqi)} पर बाहर अच्छी तरह फिट N95 या FFP2 मास्क पहनें। कपड़े या सर्जिकल मास्क महीन कणों पर बहुत कम असर करते हैं।`;
  if (c.aqi >= 101)
    return `सिर्फ़ तब, जब आप प्रदूषण के प्रति संवेदनशील हों। एक्यूआई ${String(c.aqi)} पर बाकी लोग बिना मास्क जा सकते हैं।`;
  return `नहीं। एक्यूआई ${String(c.aqi)} पर हवा ${levelHindi(c.level)} है।`;
}

export function windowsHindi(c: AssistantContext): string {
  if (c.aqi >= 101)
    return `खिड़कियाँ बंद रखें। बाहर एक्यूआई ${String(c.aqi)} है, जो ज़्यादातर कमरों से ख़राब है। प्यूरीफ़ायर हो तो उसे तेज़ पर चलाएँ।`;
  return `खोल दें। बाहर एक्यूआई ${String(c.aqi)} है, हवा ${levelHindi(c.level)} है।${c.best !== undefined ? ` दस मिनट के लिए ${spanHindi(c.best.span)} सबसे अच्छा समय है।` : ''}`.trim();
}

export function alertsHindi(c: AssistantContext): string {
  const list = c.alertsHi?.length === c.alerts.length ? c.alertsHi : c.alerts;
  if (list.length === 0) return `अगले तीन दिनों में ${c.place} के लिए कोई चेतावनी नहीं है।`;
  return `अगले तीन दिनों की चेतावनियाँ: ${list.join('; ')}। ये हमारे अनुमान हैं, आदेश नहीं; आधिकारिक आदेश पहले आते हैं।`;
}

export function firesHindi(c: AssistantContext): string {
  if (c.fires === undefined)
    return 'अभी पराली जलने की गिनती नहीं मिल सकी, इसलिए इस बारे में कुछ कहने को नहीं है।';
  return `पिछले 24 घंटों में ${c.place} के पास उपग्रह ने ${String(c.fires)} आग देखीं, 100 किमी के भीतर, या हवा की दिशा में 300 किमी के भीतर। ${c.fires >= 10 ? 'यह ज़्यादा है, और धुआँ एक-दो दिन में आप तक पहुँच सकता है: खिड़कियाँ बंद रखें, और जलाने की सूचना देने के लिए अलर्ट पर संपर्क अधिकारी बटन का उपयोग करें।' : 'यह ज़्यादा नहीं है।'}`;
}

export function smokeHindi(c: AssistantContext): string {
  const n = Math.round((c.pm25 / 22) * 10) / 10;
  return `${c.place} की हवा में एक दिन, PM2.5 ${String(c.pm25)} µg/m³, लगभग ${String(n)} सिगरेट के बराबर है। यह बर्कले अर्थ का मोटा नियम है, ताकि संख्या को महसूस करना आसान हो। यह चिकित्सा माप नहीं है।`;
}

export function fallbackHindi(c: AssistantContext): string {
  return `अभी ${c.place} में एक्यूआई ${String(c.aqi)} है, हवा ${levelHindi(c.level)} है। सैर, स्कूल, मास्क, खिड़कियाँ, चेतावनियाँ, पराली जलाना या सिगरेट के बराबर के बारे में पूछें।`;
}
