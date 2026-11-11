/** 非 React 场景（lib 工具函数、回调）取当前语言文案：与 useI18n().t 同一套路径与插值规则 */
import { getActiveLocale } from "./detect.ts";
import { interpolate, lookupMessage, type TVars } from "./lookup.ts";
import { messages } from "./messages.ts";

// 按当前界面语言取文案；缺失时返回路径本身，便于发现漏配
export function tr(path: string, vars?: TVars): string {
  const raw = lookupMessage(messages[getActiveLocale()], path);
  return raw ? interpolate(raw, vars) : path;
}
