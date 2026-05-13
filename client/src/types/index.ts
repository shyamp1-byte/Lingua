export interface Caption {
  original: string;
  translated: string | null;
}

export interface CaptionEvent {
  partial: string | null;
  original: string | null;
  translated: string | null;
}

export type SessionStatus = "idle" | "active";

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: "ar",      label: "Arabic" },
  { code: "bg",      label: "Bulgarian" },
  { code: "zh",      label: "Chinese (Simplified)" },
  { code: "zh-hant", label: "Chinese (Traditional)" },
  { code: "cs",      label: "Czech" },
  { code: "da",      label: "Danish" },
  { code: "nl",      label: "Dutch" },
  { code: "en-us",   label: "English (American)" },
  { code: "en-gb",   label: "English (British)" },
  { code: "et",      label: "Estonian" },
  { code: "fi",      label: "Finnish" },
  { code: "fr",      label: "French" },
  { code: "de",      label: "German" },
  { code: "el",      label: "Greek" },
  { code: "hu",      label: "Hungarian" },
  { code: "id",      label: "Indonesian" },
  { code: "it",      label: "Italian" },
  { code: "ja",      label: "Japanese" },
  { code: "ko",      label: "Korean" },
  { code: "lv",      label: "Latvian" },
  { code: "lt",      label: "Lithuanian" },
  { code: "nb",      label: "Norwegian" },
  { code: "pl",      label: "Polish" },
  { code: "pt-br",   label: "Portuguese (Brazilian)" },
  { code: "pt-pt",   label: "Portuguese (European)" },
  { code: "ro",      label: "Romanian" },
  { code: "ru",      label: "Russian" },
  { code: "sk",      label: "Slovak" },
  { code: "sl",      label: "Slovenian" },
  { code: "es",      label: "Spanish" },
  { code: "sv",      label: "Swedish" },
  { code: "tr",      label: "Turkish" },
  { code: "uk",      label: "Ukrainian" },
];
