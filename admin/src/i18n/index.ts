export { I18nProvider, useI18n, type TFunction } from "./context";
export {
  applyLocale,
  detectLocale,
  formatDateTime,
  formatNumber,
  formatTimeOfDay,
  getActiveLocale,
  isLocale,
  localeFromBrowser,
  LOCALES,
  type Locale,
} from "./detect";
export { messages, type Messages } from "./messages";
export { tMarkup, tRich } from "./rich";
export { tr } from "./translate";
