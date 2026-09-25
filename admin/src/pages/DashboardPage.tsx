import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Banknote,
  Clapperboard,
  Film,
  Layers,
  Receipt,
  Settings,
  Shapes,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageSection } from "@/components/admin/PageSection";
import { PageHeader } from "@/components/ui/page";
import { api, type AdminOrder, type AdminStats, type AdminUpstreamUsage, type PageMeta } from "@/api/client";
import { AdminEntityLink } from "@/components/admin/AdminEntityLink";
import { fenToYuan } from "@/lib/utils";
import { projectStatusLabel, taskDomainLabel } from "@/lib/statusLabels";
import { Button } from "@/components/ui/button";
import {
  buildStatsQuery,
  dashboardRangeLabel,
  DashboardFilters,
  DEFAULT_DASHBOARD_FILTERS,
  PROJECTS_DASHBOARD_FILTERS,
  type DashboardFilterState,
} from "@/pages/dashboard/DashboardFilters";
import { DashboardKpiCard } from "@/pages/dashboard/DashboardKpiCard";
import { DashboardInsightGrid } from "@/pages/dashboard/DashboardInsightGrid";
import { DashboardPeriodKpis } from "@/pages/dashboard/DashboardPeriodKpis";
import { DashboardSectionTabs, type DashboardSection } from "@/pages/dashboard/DashboardSectionTabs";
import { buildDomainInsights } from "@/pages/dashboard/dashboardInsightMaps";
import { buildFinanceInsights, buildProjectInsights } from "@/pages/dashboard/dashboardSectionInsights";
import { sumDailyUsage } from "@/pages/dashboard/dashboardMetrics";
import { UsageDistributionChart } from "@/pages/dashboard/UsageDistributionChart";
import { TopUsersRankingChart } from "@/pages/dashboard/TopUsersRankingChart";
import { UsageTrendChart } from "@/pages/dashboard/UsageTrendChart";
import { formatDateTime, formatNumber, useI18n } from "@/i18n";
import { tr } from "@/i18n/translate";

type OrderRes = { items: AdminOrder[]; meta: PageMeta };

const CAPABILITY_LABELS: Record<string, string> = {
  get llm() { return tr("dashboard.llmText") },
  get image() { return tr("dashboard.image") },
  get video() { return tr("dashboard.video") },
  get tts() { return tr("dashboard.voice") },
  get unknown() { return tr("dashboard.other") },
  get other() { return tr("dashboard.other") },
};

function statusClass(status: string): string {
  if (status === "DONE") return "is-done";
  if (status === "FAILED" || status === "REJECTED" || status === "CANCELLED") return "is-fail";
  if (status === "SCRIPTING" || status === "IMAGING" || status === "VIDEOING" || status === "COMPOSING") {
    return "is-run";
  }
  return "is-warn";
}

function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}

function domainChartLabel(key: string): string {
  if (key === "kepu") return tr("dashboard.aiShortVideo");
  return taskDomainLabel(key);
}

/** 管理端仪表盘：板块切换 + 渐变 KPI + 可筛选用量图表 */
export function DashboardPage() {
  const { t: tx } = useI18n();
  const [section, setSection] = useState<DashboardSection>("overview");
  const [filters, setFilters] = useState<DashboardFilterState>(DEFAULT_DASHBOARD_FILTERS);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [upstreamUsage, setUpstreamUsage] = useState<AdminUpstreamUsage | null>(null);
  const [upstreamSyncing, setUpstreamSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUpstreamUsage = useCallback(async () => {
    try {
      const data = await api<AdminUpstreamUsage>("/api/admin/stats/upstream-usage?days=30");
      setUpstreamUsage(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("dashboard.couldLoadOfficialUsage"));
    }
  }, []);

  const syncUpstreamUsage = useCallback(async () => {
    setUpstreamSyncing(true);
    try {
      await api("/api/admin/stats/upstream-usage/sync?days=30", { method: "POST" });
      toast.success(tr("dashboard.officialUsageRefreshed"));
      await loadUpstreamUsage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("dashboard.refreshFailed"));
    } finally {
      setUpstreamSyncing(false);
    }
  }, [loadUpstreamUsage]);

  const loadData = useCallback(async (nextFilters: DashboardFilterState) => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        api<AdminStats>(buildStatsQuery(nextFilters)),
        api<OrderRes>("/api/admin/orders?page=1&page_size=8&status=paid"),
      ]);
      setStats(s);
      setOrders(o.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("dashboard.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  const kpiReady = Boolean(stats);
  const kpiPlaceholder = loading ? "…" : "—";
  const statsFilters = section === "projects" ? PROJECTS_DASHBOARD_FILTERS : filters;
  const projectsRangeLabel = dashboardRangeLabel(PROJECTS_DASHBOARD_FILTERS.days);

  useEffect(() => {
    void loadData(statsFilters);
  }, [statsFilters, loadData]);

  useEffect(() => {
    void loadUpstreamUsage();
  }, [loadUpstreamUsage]);

  const statusEntries = Object.entries(stats?.project_status_counts ?? {}).sort((a, b) => b[1] - a[1]);
  const daily = stats?.daily_usage ?? [];
  const byCapability = stats?.usage_by_capability ?? [];
  const byDomain = stats?.usage_by_domain ?? [];
  const topUsers = stats?.top_users_by_charge ?? [];
  const rangeLabel = dashboardRangeLabel(filters.days);
  const showUsageFilters = section === "overview" || section === "usage";
  const domainInsights = buildDomainInsights(byDomain, filters.metric, domainChartLabel);
  const financeInsights = buildFinanceInsights(stats, upstreamUsage);
  const projectInsights = buildProjectInsights(stats, sumDailyUsage(daily));
  const metricHint =
    filters.metric === "cost" ? tx("dashboard.upstreamCost") : filters.metric === "calls" ? tx("dashboard.calls") : tx("dashboard.chargeAmount");

  return (
    <div className="admin-page admin-dashboard-page">
      <PageHeader description={tx("dashboard.overviewUsersTopUps")} />

      <div className="admin-dashboard-kpi-grid">
        <DashboardKpiCard
          label={tx("dashboard.totalUsers")}
          value={kpiReady ? stats!.user_count : kpiPlaceholder}
          hint={tx("dashboard.registeredUsers")}
          icon={Users}
          tone="teal"
        />
        <DashboardKpiCard
          label={tx("dashboard.totalPaid")}
          value={kpiReady ? `¥${fenToYuan(stats!.order_paid_total_fen)}` : kpiPlaceholder}
          hint={tx("dashboard.lifetimeTopUps")}
          icon={Banknote}
          tone="blue"
        />
        <DashboardKpiCard
          label={tx("dashboard.aiChargesMonth")}
          value={kpiReady ? `¥${fenToYuan(stats!.usage_charge_month_fen ?? 0)}` : kpiPlaceholder}
          hint={kpiReady ? tx("dashboard.todayAmount", { amount: fenToYuan(stats!.usage_charge_today_fen ?? 0) }) : tx("dashboard.todaySCharges")}
          icon={Zap}
          tone="purple"
        />
        <DashboardKpiCard
          label={tx("dashboard.upstreamCostMonth")}
          value={kpiReady ? `¥${fenToYuan(stats!.usage_cost_month_fen ?? 0)}` : kpiPlaceholder}
          hint={kpiReady ? tx("dashboard.todayAmount", { amount: fenToYuan(stats!.usage_cost_today_fen ?? 0) }) : tx("dashboard.costSummary")}
          icon={Wallet}
          tone="sand"
        />
      </div>

      <DashboardSectionTabs value={section} onChange={setSection} />

      {showUsageFilters ? <DashboardFilters value={filters} onChange={setFilters} /> : null}
      {showUsageFilters ? <DashboardPeriodKpis stats={stats} filters={filters} loading={loading} /> : null}

      {section === "overview" ? (
        <>
          <div className="admin-dashboard-charts">
            <PageSection
              title={tx("dashboard.usageTrend", { rangeLabel })}
              description={loading ? tx("dashboard.loading") : tx("dashboard.dailyTrendAggregatedCurrent")}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageTrendChart data={daily} metric={filters.metric} />
            </PageSection>

            <PageSection
              title={tx("dashboard.capabilityBreakdown")}
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byCapability}
                metric={filters.metric}
                labelForKey={capabilityLabel}
                variant="donut"
              />
            </PageSection>
          </div>

          <PageSection
            title={tx("dashboard.top3Spenders", { rangeLabel })}
            actions={
              <Link to="/orders?tab=usage" className="admin-link">
                {tx("dashboard.more")}
              </Link>
            }
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0"
          >
            <TopUsersRankingChart users={topUsers.slice(0, 3)} metric={filters.metric} />
          </PageSection>

          <div className="admin-dashboard-charts">
            <PageSection
              title={tx("dashboard.domainBreakdown")}
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byDomain}
                metric={filters.metric}
                labelForKey={domainChartLabel}
                variant="bar"
              />
            </PageSection>
            <PageSection
              title={tx("dashboard.domainInsights")}
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <DashboardInsightGrid items={domainInsights} columns={2} />
            </PageSection>
          </div>
        </>
      ) : null}

      {section === "usage" ? (
        <>
          <div className="admin-dashboard-charts">
            <PageSection
              title={tx("dashboard.usageTrend", { rangeLabel })}
              description={loading ? tx("dashboard.loading") : tx("dashboard.chargesCostsCallsAggregated")}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageTrendChart data={daily} metric={filters.metric} />
            </PageSection>

            <PageSection
              title={tx("dashboard.capabilityBreakdown")}
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byCapability}
                metric={filters.metric}
                labelForKey={capabilityLabel}
                variant="donut"
              />
            </PageSection>
          </div>

          <div className="admin-dashboard-charts">
            <PageSection
              title={tx("dashboard.domainBreakdown")}
              description={`${rangeLabel} · ${metricHint}`}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-main admin-dashboard-glass min-h-0"
            >
              <UsageDistributionChart
                data={byDomain}
                metric={filters.metric}
                labelForKey={domainChartLabel}
                variant="bar"
              />
            </PageSection>
            <PageSection
              title={tx("dashboard.spendingRanking", { rangeLabel })}
              actions={
                <Link to="/orders?tab=usage" className="admin-link">
                  {tx("dashboard.usageDetails")}
                </Link>
              }
              description={metricHint}
              bodyClassName="!pt-2"
              className="admin-dashboard-chart-side admin-dashboard-glass min-h-0"
            >
              <TopUsersRankingChart users={topUsers} metric={filters.metric} />
            </PageSection>
          </div>
        </>
      ) : null}

      {section === "finance" ? (
        <div className="admin-dashboard-body admin-dashboard-body--finance">
          <PageSection
            title={tx("dashboard.financeOverview")}
            description={tx("dashboard.topUpsChargesCosts")}
            actions={
              <Link to="/finance" className="admin-link">
                {tx("dashboard.financeList")}
              </Link>
            }
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0 admin-dashboard-body--full"
          >
            <DashboardInsightGrid items={financeInsights} columns={3} />
          </PageSection>

          <PageSection
            title={tx("dashboard.tokenfreeOfficialUsageComparison")}
            description={
              upstreamUsage?.configured
                ? tx("dashboard.upstreamNote", { sync: upstreamUsage.last_sync_at ? tx("dashboard.lastSync", { t: formatDateTime(upstreamUsage.last_sync_at) }) : "" })
                : tx("dashboard.tokenfreeApiKeyConfigured")
            }
            actions={
              upstreamUsage?.configured ? (
                <Button type="button" size="sm" variant="outline" disabled={upstreamSyncing} onClick={() => void syncUpstreamUsage()}>
                  {upstreamSyncing ? tx("dashboard.refreshing") : tx("dashboard.refreshOfficialData")}
                </Button>
              ) : null
            }
            bodyClassName="!pt-0"
            className="admin-dashboard-glass min-h-0"
          >
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tx("dashboard.date")}</th>
                    <th>{tx("dashboard.localCost")}</th>
                    <th>{tx("dashboard.localTokens")}</th>
                    <th>{tx("dashboard.officialTokens")}</th>
                    <th>{tx("dashboard.officialCost")}</th>
                    <th>{tx("dashboard.difference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(upstreamUsage?.series ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="!text-center text-[var(--admin-muted)]">
                        {tx("dashboard.comparisonData")}
                      </td>
                    </tr>
                  ) : (
                    [...(upstreamUsage?.series ?? [])].reverse().slice(0, 14).map((row) => (
                      <tr key={row.date}>
                        <td className="font-mono text-xs">{row.date}</td>
                        <td>¥{fenToYuan(row.local_cost_fen)}</td>
                        <td>{formatNumber(row.local_tokens)}</td>
                        <td>{row.official_tokens > 0 ? formatNumber(row.official_tokens) : "—"}</td>
                        <td>{row.official_cost_fen > 0 ? `¥${fenToYuan(row.official_cost_fen)}` : "—"}</td>
                        <td>
                          {row.official_cost_fen > 0
                            ? `¥${fenToYuan(row.delta_fen)}${row.delta_pct != null ? ` (${row.delta_pct}%)` : ""}`
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PageSection>

          <PageSection
            title={tx("dashboard.recentOrders")}
            description={tx("dashboard.paidOrdersOnly")}
            actions={
              <Link to="/orders" className="admin-link">
                {tx("dashboard.all")}
              </Link>
            }
            bodyClassName="!pt-0"
            className="admin-dashboard-glass min-h-0"
          >
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tx("dashboard.username")}</th>
                    <th>{tx("dashboard.amount")}</th>
                    <th>{tx("dashboard.paid")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="!text-center text-[var(--admin-muted)]">
                        {tx("dashboard.paidOrdersYet")}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <AdminEntityLink kind="user" id={o.user_id} label={o.user_email ?? undefined} />
                        </td>
                        <td className="font-semibold text-[var(--admin-forest)]">¥{fenToYuan(o.amount_fen)}</td>
                        <td className="text-xs text-[var(--admin-muted)]">
                          {o.paid_at ? formatDateTime(o.paid_at) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PageSection>
        </div>
      ) : null}

      {section === "projects" ? (
        <>
          <PageSection
            title={tx("dashboard.operationsOverview")}
            description={tx("dashboard.projectScaleCallsStatus")}
            bodyClassName="!pt-2"
            className="admin-dashboard-glass min-h-0"
          >
            <DashboardInsightGrid items={projectInsights} columns={4} />
          </PageSection>

          <div className="admin-dashboard-project-row">
            <PageSection
              title={tx("dashboard.aiShortVideoProject")}
              description={tx("dashboard.dramaCount", { n: stats?.drama_project_count ?? 0 })}
              bodyClassName="!pt-2"
              className="admin-dashboard-glass min-h-0"
            >
              <div className="flex flex-wrap gap-1.5">
                {statusEntries.length === 0 ? (
                  <span className="text-xs text-[var(--admin-muted)]">{tx("dashboard.data")}</span>
                ) : (
                  statusEntries.map(([status, count]) => (
                    <span key={status} className={`admin-status-pill !px-2.5 !py-1 !text-[11px] ${statusClass(status)}`}>
                      {projectStatusLabel(status)} {count}
                    </span>
                  ))
                )}
              </div>
            </PageSection>

            <PageSection title={tx("dashboard.callStatistics")} bodyClassName="!pt-2" className="admin-dashboard-glass min-h-0">
              <div className="admin-dashboard-stat-grid">
                <div>
                  <div className="admin-dashboard-stat-grid-label">{tx("dashboard.callsToday")}</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_today ?? 0 : kpiPlaceholder}
                  </div>
                </div>
                <div>
                  <div className="admin-dashboard-stat-grid-label">{tx("dashboard.callsMonth")}</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_month ?? 0 : kpiPlaceholder}
                  </div>
                </div>
                <div>
                  <div className="admin-dashboard-stat-grid-label">{tx("dashboard.totalCalls")}</div>
                  <div className="admin-dashboard-stat-grid-value">
                    {kpiReady ? stats!.usage_calls_total ?? 0 : kpiPlaceholder}
                  </div>
                </div>
              </div>
            </PageSection>
          </div>

          <PageSection title={tx("dashboard.domainBreakdown2", { projectsRangeLabel })} bodyClassName="!pt-2" className="admin-dashboard-glass min-h-0">
            <UsageDistributionChart
              data={byDomain}
              metric="charge"
              labelForKey={domainChartLabel}
              variant="bar"
            />
          </PageSection>

          <PageSection title={tx("dashboard.shortcuts")} bodyClassName="!pt-2" className="admin-dashboard-glass">
            <div className="admin-dashboard-tools">
              <Link to="/templates" className="admin-dashboard-tool-btn">
                <Shapes className="h-5 w-5" />
                <span>{tx("dashboard.templates")}</span>
              </Link>
              <Link to="/orders?tab=usage" className="admin-dashboard-tool-btn">
                <Receipt className="h-5 w-5" />
                <span>{tx("dashboard.ordersUsage")}</span>
              </Link>
              <Link to="/users" className="admin-dashboard-tool-btn">
                <Users className="h-5 w-5" />
                <span>{tx("dashboard.users")}</span>
              </Link>
              <Link to="/projects" className="admin-dashboard-tool-btn">
                <Clapperboard className="h-5 w-5" />
                <span>{tx("dashboard.aiShortVideo")}</span>
              </Link>
              <Link to="/drama-projects" className="admin-dashboard-tool-btn">
                <Film className="h-5 w-5" />
                <span>{tx("dashboard.dramaProjects")}</span>
              </Link>
              <Link to="/queues" className="admin-dashboard-tool-btn">
                <Layers className="h-5 w-5" />
                <span>{tx("dashboard.taskQueue")}</span>
              </Link>
              <Link to="/settings" className="admin-dashboard-tool-btn">
                <Settings className="h-5 w-5" />
                <span>{tx("dashboard.systemConfiguration")}</span>
              </Link>
              <Link to="/orders" className="admin-dashboard-tool-btn">
                <Activity className="h-5 w-5" />
                <span>{tx("dashboard.financeLedger")}</span>
              </Link>
            </div>
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
