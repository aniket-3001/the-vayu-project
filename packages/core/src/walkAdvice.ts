/**
 * What to say about a walk in the cleanest hour of the day, by how clean that hour is. The hour is the best one
 * there is, so it is always named; what changes is how long to stay out and where. These are our words from the
 * US AQI, not a medical rule, and a sensitive person is told to go easier at every step.
 */
export interface WalkAdvice {
  readonly band: 'free' | 'fine' | 'short' | 'brief' | 'minimal';
  /** A few words for a tight place: "any length, anywhere". */
  readonly short: string;
  /** A full sentence or two. */
  readonly long: string;
}

export function walkAdviceFor(aqi: number): WalkAdvice {
  if (aqi <= 50)
    return {
      band: 'free',
      short: 'any length, anywhere',
      long: 'The air is good: walk anywhere, for as long as you like.',
    };
  if (aqi <= 100)
    return {
      band: 'fine',
      short: 'anywhere, any length',
      long: 'Fine for most people: walk anywhere, for as long as you like. Go easier if you are sensitive to air pollution.',
    };
  if (aqi <= 150)
    return {
      band: 'short',
      short: 'keep it short, in a park with trees',
      long: 'You may go, but keep it short, about 30 minutes, and choose a park with trees, where the air is a little cleaner. Go easier if you are sensitive.',
    };
  if (aqi <= 200)
    return {
      band: 'brief',
      short: '15–20 min, park with trees, N95',
      long: 'Go only if you need to: 15 to 20 minutes, in a park with trees, and wear a well-fitted N95 or FFP2 mask.',
    };
  return {
    band: 'minimal',
    short: '10 min at most, with an N95',
    long: 'This is the best hour of a bad day. If you must go out, 10 minutes at most, with a well-fitted N95 or FFP2 mask. Otherwise do it indoors.',
  };
}

/**
 * The same advice in Hindi, band for band, written to be read through and not machine-translated. `short` is for a
 * tight place, `long` for a sentence or two.
 */
export function walkAdviceHindi(aqi: number): Pick<WalkAdvice, 'short' | 'long'> {
  if (aqi <= 50)
    return {
      short: 'कहीं भी, जितनी देर चाहें',
      long: 'हवा अच्छी है: कहीं भी, जितनी देर चाहें टहलें।',
    };
  if (aqi <= 100)
    return {
      short: 'कहीं भी, जितनी देर चाहें',
      long: 'ज़्यादातर लोगों के लिए ठीक है: कहीं भी, जितनी देर चाहें टहलें। प्रदूषण के प्रति संवेदनशील हों तो धीरे चलें।',
    };
  if (aqi <= 150)
    return {
      short: 'थोड़ी देर, पेड़ों वाले पार्क में',
      long: 'जा सकते हैं, पर थोड़ी देर, लगभग 30 मिनट, और पेड़ों वाला पार्क चुनें, जहाँ हवा थोड़ी साफ़ होती है। संवेदनशील हों तो धीरे चलें।',
    };
  if (aqi <= 200)
    return {
      short: '15–20 मिनट, पेड़ों वाला पार्क, N95',
      long: 'तभी जाएँ जब ज़रूरी हो: 15 से 20 मिनट, पेड़ों वाले पार्क में, और अच्छी तरह फिट N95 या FFP2 मास्क पहनें।',
    };
  return {
    short: 'ज़्यादा से ज़्यादा 10 मिनट, N95 के साथ',
    long: 'यह एक ख़राब दिन का सबसे अच्छा घंटा है। बाहर जाना ही पड़े तो ज़्यादा से ज़्यादा 10 मिनट, अच्छी तरह फिट N95 या FFP2 मास्क के साथ। वरना घर के अंदर करें।',
  };
}
