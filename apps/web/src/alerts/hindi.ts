import type { Alert } from './model';

const DAY: Readonly<Record<0 | 1 | 2, string>> = { 0: 'आज', 1: 'कल', 2: 'परसों' };

/**
 * An alert in a few Hindi words, for the assistant's answers in Hindi: fixed wording for each kind, with the stage and
 * the day slotted in. It says what the alert is, and nothing the English alert does not.
 */
export function alertTitleHindi(alert: Alert): string {
  const day = DAY[alert.day];
  switch (alert.kind) {
    case 'grap':
      return `${day} ग्रैप चरण ${String(alert.stage ?? 1)} की संभावना`;
    case 'smog':
      return `${day} स्मॉग की संभावना`;
    case 'stubble':
      return 'आसपास पराली जलाने की घटनाएँ ज़्यादा';
    case 'rain':
      // The English title promises clean air only when the forecast for the day shows it.
      return alert.title.includes('should clear the air')
        ? `${day} बारिश से हवा साफ़ होगी`
        : `${day} बारिश की संभावना`;
    case 'wind':
      return `${day} तेज़ हवा से हवा हल्की होगी`;
  }
}
