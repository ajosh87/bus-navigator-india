export const LANGUAGES: Record<string, string> = {
  'Kannada':   'kn-IN',
  'Hindi':     'hi-IN',
  'Tamil':     'ta-IN',
  'Telugu':    'te-IN',
  'Malayalam': 'ml-IN',
  'Marathi':   'mr-IN',
  'Bengali':   'bn-IN',
  'Gujarati':  'gu-IN',
  'Punjabi':   'pa-IN',
  'Odia':      'or-IN',
  'Assamese':  'as-IN',
  'Urdu':      'ur-IN',
  'Konkani':   'kok-IN',
  'Nepali':    'ne-IN',
  'Sanskrit':  'sa-IN',
  'Maithili':  'mai-IN',
  'Bodo':      'brx-IN',
  'Dogri':     'doi-IN',
  'Kashmiri':  'ks-IN',
  'Manipuri':  'mni-IN',
  'Santali':   'sat-IN',
  'Sindhi':    'sd-IN',
  'English':   'en-IN',
};

/** Endonyms — so a speaker can find their own language by its own script. */
export const NATIVE_NAMES: Record<string, string> = {
  'Kannada':   'ಕನ್ನಡ',
  'Hindi':     'हिन्दी',
  'Tamil':     'தமிழ்',
  'Telugu':    'తెలుగు',
  'Malayalam': 'മലയാളം',
  'Marathi':   'मराठी',
  'Bengali':   'বাংলা',
  'Gujarati':  'ગુજરાતી',
  'Punjabi':   'ਪੰਜਾਬੀ',
  'Odia':      'ଓଡ଼ିଆ',
  'Assamese':  'অসমীয়া',
  'Urdu':      'اُردُو',
  'Konkani':   'कोंकणी',
  'Nepali':    'नेपाली',
  'Sanskrit':  'संस्कृतम्',
  'Maithili':  'मैथिली',
  'Bodo':      'बड़ो',
  'Dogri':     'डोगरी',
  'Kashmiri':  'کٲشُر',
  'Manipuri':  'ꯃꯤꯇꯩ ꯂꯣꯟ',
  'Santali':   'ᱥᱟᱱᱛᱟᱲᱤ',
  'Sindhi':    'سنڌي',
  'English':   'English',
};

export const LANG_NAMES = Object.keys(LANGUAGES);

/** Shape the LanguageSheet consumes. */
export const LANG_OPTIONS = LANG_NAMES.map((name) => ({
  name,
  native: NATIVE_NAMES[name] ?? name,
}));

export interface PhraseGroup {
  id: string;
  label: string;
  icon: string;
  phrases: string[];
}

export const PHRASE_GROUPS: PhraseGroup[] = [
  {
    id: 'boarding',
    label: 'Boarding',
    icon: 'log-in',
    phrases: [
      'Does this bus go to Majestic?',
      'Is this the right bus for Silk Board?',
      'Which platform does this bus leave from?',
      'When is the next bus?',
    ],
  },
  {
    id: 'fare',
    label: 'Fare',
    icon: 'credit-card',
    phrases: [
      'How much is the fare?',
      'How much for two tickets to Majestic?',
      'Do you take UPI QR payment?',
      'I have a bus pass.',
    ],
  },
  {
    id: 'stops',
    label: 'Stops',
    icon: 'map-pin',
    phrases: [
      'Please tell me when my stop arrives.',
      'How many stops until Indiranagar?',
      'I need to get off at the next stop.',
      'Did we already pass Town Hall?',
    ],
  },
  {
    id: 'help',
    label: 'Help',
    icon: 'help-circle',
    phrases: [
      'I am lost. Can you help me?',
      'I do not speak this language.',
      'Where is the nearest bus stop?',
      'Can you write it down for me?',
    ],
  },
];

export const DEMO_ROUTES: Record<
  string,
  { origin: string; dest: string; stops: string[]; fare?: string; frequency?: string }
> = {
  '500D': {
    origin: 'Kempegowda Bus Station (Majestic)',
    dest:   'Electronic City',
    fare:   '₹35',
    frequency: 'Every 12 min',
    stops:  [
      'Majestic', 'Town Hall', 'KR Market', 'Lalbagh',
      'Jayanagar 4th Block', 'JP Nagar', 'Bannerghatta Road',
      'Silk Board', 'HSR Layout', 'Electronic City Phase 1',
    ],
  },
  '335E': {
    origin: 'Shivajinagar',
    dest:   'Marathahalli',
    fare:   '₹28',
    frequency: 'Every 15 min',
    stops:  [
      'Shivajinagar', 'Trinity Circle', 'Domlur', 'Indiranagar',
      'Sony World Junction', 'Marathahalli Bridge', 'Marathahalli',
    ],
  },
  'KIA-9': {
    origin: 'Kempegowda Bus Station',
    dest:   'Kempegowda International Airport',
    fare:   '₹275',
    frequency: 'Every 20 min',
    stops:  ['Majestic', 'Yeshwantpur', 'Hebbal', 'Bellary Road', 'Devanahalli', 'KIAL'],
  },
  '201R': {
    origin: 'Kempegowda Bus Station',
    dest:   'Rajarajeshwari Nagar',
    fare:   '₹22',
    frequency: 'Every 10 min',
    stops:  ['Majestic', 'Vidhana Soudha', 'Rajajinagar', 'Chord Road', 'Nagarbhavi', 'RR Nagar'],
  },
};
