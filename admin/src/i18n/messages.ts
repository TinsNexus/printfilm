import type { Locale } from "./detect.ts";
import { en } from "./locales/en.ts";
import { vi } from "./locales/vi.ts";
import { zh } from "./locales/zh.ts";

export type Messages = typeof zh;

export const messages: Record<Locale, Messages> = {
  zh,
  en: en as unknown as Messages,
  vi: vi as unknown as Messages,
};
