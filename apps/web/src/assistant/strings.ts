import type { Lang } from './lang';

/** Every word the assistant shows or says itself, in both languages. The answers to questions come from the rules. */
export interface Words {
  readonly title: string;
  readonly languageLabel: string;
  readonly sampleNote: string;
  readonly liveNote: string;
  readonly readAloud: string;
  readonly readAloudOn: string;
  readonly readAloudOff: string;
  readonly close: string;
  readonly greeting: string;
  readonly suggestions: readonly string[];
  readonly walkedIn: (name: string) => string;
  readonly placeholder: string;
  readonly yourMessage: string;
  readonly send: string;
  readonly speak: string;
  readonly stopListening: string;
  readonly listening: string;
  readonly transcribing: string;
  readonly sayItNow: string;
  readonly cancel: string;
  readonly listen: string;
  readonly checking: string;
  readonly ctaTitle: string;
  readonly ctaNote: string;
  readonly request: string;
  readonly quickAnswers: string;
  readonly suggested: string;
  readonly noAnswer: string;
  readonly addPlaceFirst: string;
  readonly noAirNow: string;
  readonly noSchool: string;
  readonly noWork: string;
  readonly noPlaceBasis: string;
  readonly noReadingBasis: string;
  readonly outdoorBasis: string;
  readonly addedBasis: string;
  readonly fireBasis: string;
  readonly seeInExposure: string;
  readonly seeOnMap: string;
  readonly didNotSend: string;
  readonly whereIsFire: string;
  readonly nearMe: string;
  readonly findingYou: string;
  readonly cannotLocate: string;
  readonly couldNotLocate: string;
  readonly fireNote: (label: string) => string;
  readonly sendIt: string;
  readonly notSent: string;
  readonly leftOut: string;
  readonly didNotGoThrough: string;
  readonly voiceOff: string;
  readonly languageEnglish: string;
  readonly languageHindi: string;
}

export const WORDS: Readonly<Record<Lang, Words>> = {
  en: {
    title: 'Vayu assistant',
    languageLabel: 'Language',
    sampleNote: 'Answers use made-up air, from fixed rules.',
    liveNote:
      'Answers come from fixed rules over the real readings. AI only words them, and its words are checked.',
    readAloud: 'Read answers aloud',
    readAloudOn: 'Answers are read aloud. Tap to mute.',
    readAloudOff: 'Muted. Tap to read answers aloud.',
    close: 'Close',
    greeting:
      'Ask about a walk, school, masks, windows, alerts or stubble burning. Or tell me what someone did outdoors, like “Asha walked in the park for 40 minutes”, and I will add it to their day.',
    suggestions: [
      'When can I go for a walk?',
      'Is school safe today?',
      'Do I need a mask?',
      'What alerts are coming?',
    ],
    walkedIn: (name) => `${name} walked in the park for 30 minutes`,
    placeholder: 'Ask, or tell me something',
    yourMessage: 'Your message',
    send: 'Send',
    speak: 'Speak to the assistant',
    stopListening: 'Stop listening',
    listening: 'Listening…',
    transcribing: 'Transcribing…',
    sayItNow: 'Say it now. It stops by itself after a few quiet seconds.',
    cancel: 'Cancel',
    listen: 'Listen',
    checking: 'Checking the monitors nearby…',
    ctaTitle: 'Want Vayu at your school, society or home?',
    ctaNote: 'Ask for a demo, or for air monitors at your place.',
    request: 'Request',
    quickAnswers: 'Quick answers',
    suggested: 'Suggested questions',
    noAnswer: 'No answer just now. Please try again in a moment.',
    addPlaceFirst: 'Add a place on My Air first, so there is some air to talk about.',
    noAirNow:
      'We could not get the air just now, so I have nothing to go on. Please try again in a moment.',
    noSchool:
      'Add a school on My Air first, so I can tell you about the air there. Use the Work or school field, and choose School.',
    noWork:
      'Add a work place on My Air first, so I can tell you about the air there. Use the Work or school field, and choose Work.',
    noPlaceBasis: 'No place set',
    noReadingBasis: 'No reading yet',
    outdoorBasis: 'Outdoor time',
    addedBasis: 'Added to Exposure',
    fireBasis: 'Fire report',
    seeInExposure: 'See it in Exposure',
    seeOnMap: 'See it on the map',
    didNotSend: 'Okay, I did not send a report.',
    whereIsFire: 'Where is the fire? Say near me, or name one of your places.',
    nearMe: 'Near me',
    findingYou: 'Finding where you are…',
    cannotLocate: 'This browser cannot share where you are. Name one of your places instead.',
    couldNotLocate:
      'I could not get your location. Name one of your places instead, or say cancel.',
    fireNote: (label) =>
      `Got it: the fire near ${label}. Anything to add? Say it in a line, or tap Send it.`,
    sendIt: 'Send it',
    notSent: 'Okay, I did not send a report.',
    leftOut: 'Okay, I left it out.',
    didNotGoThrough: 'That did not go through.',
    voiceOff:
      'The voice is not available right now (it may have reached its limit for today), so this answer was not read aloud.',
    languageEnglish: 'English',
    languageHindi: 'हिन्दी',
  },
  hi: {
    title: 'वायु सहायक',
    languageLabel: 'भाषा',
    sampleNote: 'जवाब नकली हवा के आँकड़ों पर, तय नियमों से बने हैं।',
    liveNote:
      'जवाब असली रीडिंग पर तय नियमों से बनते हैं। हिंदी जवाब सीधे हमारे लिखे शब्दों में हैं; एआई उन्हें नहीं बदलता।',
    readAloud: 'जवाब बोलकर सुनाएँ',
    readAloudOn: 'जवाब बोलकर सुनाए जा रहे हैं। बंद करने के लिए दबाएँ।',
    readAloudOff: 'आवाज़ बंद है। जवाब सुनने के लिए दबाएँ।',
    close: 'बंद करें',
    greeting:
      'सैर, स्कूल, मास्क, खिड़कियाँ, चेतावनियाँ या पराली जलाने के बारे में पूछें। या बताएँ कि किसी ने बाहर क्या किया, जैसे “आशा ने पार्क में 40 मिनट टहला”, और मैं उसे उनके दिन में जोड़ दूँगा।',
    suggestions: [
      'आज टहलने कब जा सकता हूँ?',
      'क्या आज स्कूल सुरक्षित है?',
      'क्या मुझे मास्क चाहिए?',
      'कौन सी चेतावनियाँ आ रही हैं?',
    ],
    walkedIn: (name) => `${name} ने पार्क में 30 मिनट टहला`,
    placeholder: 'पूछें, या कुछ बताएँ',
    yourMessage: 'आपका संदेश',
    send: 'भेजें',
    speak: 'सहायक से बोलकर पूछें',
    stopListening: 'सुनना बंद करें',
    listening: 'सुन रहा हूँ…',
    transcribing: 'लिख रहा हूँ…',
    sayItNow: 'अब बोलिए। कुछ सेकंड चुप रहने पर यह खुद रुक जाएगा।',
    cancel: 'रद्द करें',
    listen: 'सुनें',
    checking: 'आसपास के मॉनिटर देख रहा हूँ…',
    ctaTitle: 'अपने स्कूल, सोसाइटी या घर में वायु चाहिए?',
    ctaNote: 'डेमो माँगें, या अपनी जगह पर एयर मॉनिटर माँगें।',
    request: 'अनुरोध',
    quickAnswers: 'जल्दी जवाब',
    suggested: 'सुझाए गए सवाल',
    noAnswer: 'अभी जवाब नहीं मिला। कृपया थोड़ी देर में फिर कोशिश करें।',
    addPlaceFirst: 'पहले मेरी हवा (My Air) पर एक जगह जोड़ें, ताकि हवा के बारे में बात हो सके।',
    noAirNow:
      'अभी हवा के आँकड़े नहीं मिल सके, इसलिए मेरे पास कुछ बताने को नहीं है। कृपया थोड़ी देर में फिर कोशिश करें।',
    noSchool:
      'पहले मेरी हवा (My Air) पर स्कूल जोड़ें, ताकि मैं वहाँ की हवा बता सकूँ। "काम या स्कूल" वाला खाना चुनें और स्कूल चुनें।',
    noWork:
      'पहले मेरी हवा (My Air) पर काम की जगह जोड़ें, ताकि मैं वहाँ की हवा बता सकूँ। "काम या स्कूल" वाला खाना चुनें और काम चुनें।',
    noPlaceBasis: 'कोई जगह तय नहीं',
    noReadingBasis: 'अभी कोई रीडिंग नहीं',
    outdoorBasis: 'बाहर का समय',
    addedBasis: 'एक्सपोज़र में जोड़ा',
    fireBasis: 'आग की रिपोर्ट',
    seeInExposure: 'एक्सपोज़र में देखें',
    seeOnMap: 'नक्शे पर देखें',
    didNotSend: 'ठीक है, मैंने रिपोर्ट नहीं भेजी।',
    whereIsFire: 'आग कहाँ है? "मेरे पास" कहें, या अपनी किसी जगह का नाम बताएँ।',
    nearMe: 'मेरे पास',
    findingYou: 'आप कहाँ हैं, यह खोज रहा हूँ…',
    cannotLocate: 'यह ब्राउज़र आपकी जगह नहीं बता सकता। अपनी किसी जगह का नाम बताएँ।',
    couldNotLocate: 'आपकी जगह नहीं मिल सकी। अपनी किसी जगह का नाम बताएँ, या रद्द कहें।',
    fireNote: (label) =>
      `समझ गया: ${label} के पास आग। कुछ जोड़ना है? एक पंक्ति में कहें, या "भेजें" दबाएँ।`,
    sendIt: 'भेजें',
    notSent: 'ठीक है, मैंने रिपोर्ट नहीं भेजी।',
    leftOut: 'ठीक है, मैंने इसे छोड़ दिया।',
    didNotGoThrough: 'यह नहीं हो पाया।',
    voiceOff:
      'अभी आवाज़ उपलब्ध नहीं है (आज की सीमा पूरी हो गई हो सकती है), इसलिए यह जवाब बोलकर नहीं सुनाया गया।',
    languageEnglish: 'English',
    languageHindi: 'हिन्दी',
  },
};
