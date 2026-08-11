import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AdminStats } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fenToYuan } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Dashboard overview stats
export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api<AdminStats>("/api/admin/stats")
      .then(setStats)
      .catch((err) => toast.error(err instanceof Error ? err.message : "加载失败"));
  }, []);

  const statusEntries = Object.entries(stats?.project_status_counts ?? {}).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">用户、订单与项目状态概览</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">用户总数</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{stats?.user_count ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">累计已付金额</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            ¥{stats ? fenToYuan(stats.order_paid_total_fen) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">今日已付金额</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            ¥{stats ? fenToYuan(stats.order_paid_today_fen) : "—"}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>项目状态分布</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {statusEntries.length === 0 ? (
            <span className="text-sm text-muted-foreground">暂无数据</span>
          ) : (
            statusEntries.map(([status, count]) => (
              <Badge key={status} variant="secondary" className="gap-2 px-3 py-1 text-sm font-normal">
                <span className="font-medium">{status}</span>
                <span>{count}</span>
              </Badge>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
