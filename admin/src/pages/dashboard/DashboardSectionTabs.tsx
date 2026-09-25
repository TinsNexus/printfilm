import { BarChart3, Clapperboard, LayoutDashboard, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

/** 仪表盘主板块 */
export type DashboardSection = "overview" | "usage" | "finance" | "projects";

const SECTIONS: {
  id: DashboardSection;
  label: string;
  desc: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", get label() { return tr("dashTabs.businessOverview") }, get desc() { return tr("dashTabs.keyMetricsTrends") }, icon: LayoutDashboard },
  { id: "usage", get label() { return tr("dashTabs.usageAnalysis") }, get desc() { return tr("dashTabs.callsDistribution") }, icon: BarChart3 },
  { id: "finance", get label() { return tr("dashTabs.finance") }, get desc() { return tr("dashTabs.topUpsCosts") }, icon: Wallet },
  { id: "projects", get label() { return tr("dashTabs.projectsOperations") }, get desc() { return tr("dashTabs.productionShortcuts") }, icon: Clapperboard },
];

type DashboardSectionTabsProps = {
  value: DashboardSection;
  onChange: (next: DashboardSection) => void;
};

/** 仪表盘板块切换 */
export function DashboardSectionTabs({ value, onChange }: DashboardSectionTabsProps) {
  const { t: tx } = useI18n();
  return (
    <div className="admin-dashboard-section-tabs" role="tablist" aria-label={tx("dashTabs.dashboardSections")}>
      {SECTIONS.map((item) => {
        const active = value === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn("admin-dashboard-section-tab", active && "is-active")}
            onClick={() => onChange(item.id)}
          >
            <span className="admin-dashboard-section-tab-icon">
              <Icon className="h-4 w-4" />
            </span>
            <span className="admin-dashboard-section-tab-text">
              <span className="admin-dashboard-section-tab-label">{item.label}</span>
              <span className="admin-dashboard-section-tab-desc">{item.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
