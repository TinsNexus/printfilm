import { AdminChipFilter } from "@/components/admin/AdminChipFilter";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { tr } from "../../i18n/translate.ts";

/** 仪表盘筛选维度 */
export type DashboardDays = "1" | "7" | "14" | "30";
export type DashboardDomain = "all" | "drama" | "kepu" | "tools" | "studio";
export type DashboardCapability = "all" | "llm" | "image" | "video" | "tts";
export type DashboardMetric = "charge" | "calls";

export type DashboardFilterState = {
  days: DashboardDays;
  domain: DashboardDomain;
  capability: DashboardCapability;
  metric: DashboardMetric;
};

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilterState = {
  days: "7",
  domain: "all",
  capability: "all",
  metric: "charge",
};

/** 运维 Tab 固定全量 30 日，不受隐藏筛选影响 */
export const PROJECTS_DASHBOARD_FILTERS: DashboardFilterState = {
  days: "30",
  domain: "all",
  capability: "all",
  metric: "charge",
};

const DAY_OPTIONS = [
  { value: "1", get label() { return tr("dashUi.range.today"); } },
  { value: "7", get label() { return tr("dashUi.range.lastN", { n: 7 }); } },
  { value: "14", get label() { return tr("dashUi.range.lastN", { n: 14 }); } },
  { value: "30", get label() { return tr("dashUi.range.lastN", { n: 30 }); } },
];

/** 图表 / 区块标题用的时间范围文案 */
export function dashboardRangeLabel(days: DashboardDays): string {
  if (days === "1") return tr("dashUi.range.today");
  return tr("dashUi.range.lastN", { n: days });
}

const DOMAIN_OPTIONS = [
  { value: "all", get label() { return tr("dashUi.allDomains"); } },
  { value: "drama", get label() { return tr("dashUi.domain.drama"); } },
  { value: "kepu", get label() { return tr("dashUi.domain.kepu"); } },
  { value: "tools", get label() { return tr("dashUi.domain.tools"); } },
  { value: "studio", get label() { return tr("dashUi.domain.studio"); } },
];

const CAPABILITY_OPTIONS = [
  { value: "all", get label() { return tr("dashUi.allCaps"); } },
  { value: "llm", label: "LLM" },
  { value: "image", get label() { return tr("dashUi.cap.image"); } },
  { value: "video", get label() { return tr("dashUi.cap.video"); } },
  { value: "tts", get label() { return tr("dashUi.cap.tts"); } },
];

const METRIC_OPTIONS = [
  { value: "charge", get label() { return tr("dashUi.metric.charge"); } },
  { value: "calls", get label() { return tr("dashUi.metric.calls"); } },
];

type DashboardFiltersProps = {
  value: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
};

/** 仪表盘用量筛选条（两行紧凑布局） */
export function DashboardFilters({ value, onChange }: DashboardFiltersProps) {
  const patch = (partial: Partial<DashboardFilterState>) => onChange({ ...value, ...partial });

  return (
    <AdminFilterBar className="admin-dashboard-filters">
      <AdminChipFilter
        label={tr("dashUi.filterRange")}
        value={value.days}
        options={DAY_OPTIONS}
        onChange={(days) => patch({ days: days as DashboardDays })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={tr("dashUi.filterDomain")}
        value={value.domain}
        options={DOMAIN_OPTIONS}
        onChange={(domain) => patch({ domain: domain as DashboardDomain })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={tr("dashUi.filterCap")}
        value={value.capability}
        options={CAPABILITY_OPTIONS}
        onChange={(capability) => patch({ capability: capability as DashboardCapability })}
        className="admin-chip-filter--segment"
      />
      <AdminChipFilter
        label={tr("dashUi.filterMetric")}
        value={value.metric}
        options={METRIC_OPTIONS}
        onChange={(metric) => patch({ metric: metric as DashboardMetric })}
        className="admin-chip-filter--segment"
      />
    </AdminFilterBar>
  );
}

/** 拼接 stats API 查询串 */
export function buildStatsQuery(filters: DashboardFilterState): string {
  const params = new URLSearchParams({
    days: filters.days,
    domain: filters.domain,
    capability: filters.capability,
    top_metric: filters.metric,
  });
  return `/api/admin/stats?${params.toString()}`;
}
