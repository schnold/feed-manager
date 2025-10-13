import { Select } from "@shopify/polaris";

export interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

interface LanguageSelectorProps {
  locales: ShopLocale[];
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

export function LanguageSelector({ 
  locales, 
  selectedLanguage, 
  onLanguageChange, 
  disabled = false 
}: LanguageSelectorProps) {
  console.log("LanguageSelector received locales:", locales);
  console.log("Number of locales received:", locales?.length || 0);
  
  // Filter to only show published locales
  const publishedLocales = locales?.filter(locale => locale.published) || [];
  console.log("Published locales:", publishedLocales);
  console.log("Number of published locales:", publishedLocales.length);
  
  // Transform locales to options format for Polaris Select
  const options = publishedLocales.map((locale) => ({
    label: locale.primary ? `${locale.name} (Primary)` : locale.name,
    value: locale.locale,
  }));
  
  console.log("Select options:", options);

  const handleSelectChange = (value: string) => {
    onLanguageChange(value);
  };

  return (
    <Select
      label="Language"
      options={options}
      value={selectedLanguage}
      onChange={handleSelectChange}
      disabled={disabled}
      helpText="Select the language for this feed"
    />
  );
}

// Helper function to get language display name
export function getLanguageDisplayName(locale: string): string {
  const languageNames: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'pl': 'Polish',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'tr': 'Turkish',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'bg': 'Bulgarian',
    'hr': 'Croatian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'et': 'Estonian',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'uk': 'Ukrainian',
    'el': 'Greek',
    'he': 'Hebrew',
    'id': 'Indonesian',
    'ms': 'Malay',
    'tl': 'Filipino',
    'bn': 'Bengali',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'or': 'Odia',
    'as': 'Assamese',
    'ne': 'Nepali',
    'si': 'Sinhala',
    'my': 'Burmese',
    'km': 'Khmer',
    'lo': 'Lao',
    'ka': 'Georgian',
    'am': 'Amharic',
    'sw': 'Swahili',
    'zu': 'Zulu',
    'af': 'Afrikaans',
    'sq': 'Albanian',
    'az': 'Azerbaijani',
    'be': 'Belarusian',
    'bs': 'Bosnian',
    'ca': 'Catalan',
    'cy': 'Welsh',
    'eu': 'Basque',
    'fa': 'Persian',
    'gl': 'Galician',
    'is': 'Icelandic',
    'ga': 'Irish',
    'mk': 'Macedonian',
    'mt': 'Maltese',
    'mn': 'Mongolian',
    'sr': 'Serbian',
    'ur': 'Urdu',
    'uz': 'Uzbek',
    'yo': 'Yoruba',
    'ig': 'Igbo',
    'ha': 'Hausa',
    'so': 'Somali',
    'rw': 'Kinyarwanda',
    'ny': 'Chichewa',
    'sn': 'Shona',
    'st': 'Sesotho',
    'tn': 'Setswana',
    'ss': 'Swati',
    've': 'Venda',
    'ts': 'Tsonga',
    'nr': 'Ndebele',
    'xh': 'Xhosa'
  };

  return languageNames[locale] || locale.toUpperCase();
}
