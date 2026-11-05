import { tFor, type Key, type Locale } from "./i18n";

const questionKeys: Key[] = ["mq.day", "mq.feeling", "mq.food", "mq.treatment", "mq.moment"];
const locales: Locale[] = ["ko", "en", "fr"];
// This face is used only for these fixed questions. Build the subset from the
// dictionaries so translations cannot silently lose glyphs. Keep the approved
// 900 face; body text and user-written content retain the full sans-serif face.
const questionGlyphs = [
  ...new Set(locales.flatMap((locale) => questionKeys.flatMap((key) => [...tFor(locale, key)]))),
]
  .sort()
  .join("");

export const APP_FONT_STYLESHEETS = [
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap",
  `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@900&display=swap&text=${encodeURIComponent(questionGlyphs)}`,
] as const;
