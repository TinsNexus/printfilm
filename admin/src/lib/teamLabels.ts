import { tr } from "../i18n/translate.ts";
/** 团队日期统一按上海时区展示，避免服务器与浏览器时区差异。 */
export function teamDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

/** 平台管理员查看的团队内角色名称。 */
// getter：读取时按当前语言取文案
export const teamRoleLabels = {
  get owner() { return tr("teamsUi.roles.owner"); },
  get admin() { return tr("teamsUi.roles.admin"); },
  get member() { return tr("teamsUi.roles.member"); },
};
