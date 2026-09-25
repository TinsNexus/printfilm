/** 浏览器语言检测、本地覆盖与 html lang 同步 */

export type Locale = "zh" | "en" | "vi";

export const LOCALES: Locale[] = ["zh", "en", "vi"];

export const LOCALE_STORAGE_KEY = "printfilm.admin.locale";

export const LOCALE_HTML: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
  vi: "vi",
};

export const LOCALE_DATE: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en-US",
  vi: "vi-VN",
};

// 当前生效语言（供非 React 工具函数读取）
let activeLocale: Locale = "zh";

// 是否为已支持的语言代码
export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en" || value === "vi";
}

// 从 navigator 语言映射到 zh / vi / en
export function localeFromBrowser(lang?: string): Locale {
  const raw = (lang || "").trim().toLowerCase();
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("vi")) return "vi";
  return "en";
}

// 读取用户手动选择；无记录则返回 null（跟随浏览器）
export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

// 首次进入：有手动选择用手动，否则跟浏览器（管理后台原为中文，无法识别时回退中文）
export function detectLocale(): Locale {
  const stored = typeof window === "undefined" ? null : readStoredLocale();
  if (stored) return stored;
  if (typeof navigator === "undefined") return "zh";
  const hint = navigator.language || navigator.languages?.[0] || "zh";
  return localeFromBrowser(hint);
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

// 应用语言：写 html lang；persist 时才写入 localStorage
export function applyLocale(locale: Locale, persist: boolean): void {
  activeLocale = locale;
  if (persist) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore quota / private mode */
    }
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = LOCALE_HTML[locale];
  }
}

// 日期时间按当前语言格式化
export function formatDateTime(value?: string | Date | null, locale: Locale = activeLocale): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE_DATE[locale]);
}

// 数字按当前语言分组（如 12,345）
export function formatNumber(value: number, locale: Locale = activeLocale): string {
  return value.toLocaleString(LOCALE_DATE[locale]);
}
