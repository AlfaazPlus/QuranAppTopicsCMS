export interface LangInfo {
  code: string;
  name: string;
  dir: "ltr" | "rtl";
  native?: string;
}

// Mirrors QuranApp's app/src/main/res/values/available_locales.xml (English is the source text, so it is omitted).
const L = (code: string, name: string, native: string, dir: "ltr" | "rtl" = "ltr"): LangInfo => ({ code, name, native, dir });

export const COMMON_LANGUAGES: LangInfo[] = [
  L("ar", "Arabic", "العربية", "rtl"),
  L("bn", "Bengali", "বাংলা"),
  L("ckb", "Kurdish (Sorani)", "کوردی", "rtl"),
  L("de", "German", "Deutsch"),
  L("es", "Spanish", "Español"),
  L("fa", "Persian", "فارسی", "rtl"),
  L("fil", "Filipino", "Filipino"),
  L("fr", "French", "Français"),
  L("gu", "Gujarati", "ગુજરાતી"),
  L("hi", "Hindi", "हिन्दी"),
  L("id", "Indonesian", "Indonesian"),
  L("it", "Italian", "Italiano"),
  L("ky", "Kyrgyz", "Кыргызча"),
  L("ml", "Malayalam", "മലയാളം"),
  L("pt", "Portuguese", "Português"),
  L("ru", "Russian", "Русский"),
  L("sd", "Sindhi", "سنڌي", "rtl"),
  L("ta", "Tamil", "தமிழ்"),
  L("tr", "Turkish", "Türkçe"),
  L("ur", "Urdu", "اردو", "rtl"),
  L("zh-CN", "Chinese (Simplified)", "简体中文"),
  L("zh-TW", "Chinese (Traditional)", "繁體中文"),
];
