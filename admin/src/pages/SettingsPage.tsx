import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { OssSettingsPanel } from "@/components/settings/OssSettingsPanel";
import { PaymentSettingsPanel } from "@/components/settings/PaymentSettingsPanel";
import { RoutingSettingsPanel } from "@/components/settings/RoutingSettingsPanel";
import { RuntimeSettingsPanel } from "@/components/settings/RuntimeSettingsPanel";
import { SiteSettingsPanel } from "@/components/settings/SiteSettingsPanel";
import { PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";

type SettingsTab = "routing" | "runtime" | "oss" | "payment" | "site";

type ImportEnvRes = {
  imported_fields: string[];
  skipped_secret_fields: string[];
};

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "routing", label: "模型路由" },
  { id: "runtime", label: "运行参数" },
  { id: "oss", label: "存储 OSS" },
  { id: "payment", label: "支付计费" },
  { id: "site", label: "站点工具" },
];

// 系统设置：模型、运行参数、OSS、支付、站点
export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("routing");
  const [reloadKey, setReloadKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // 从服务器 .env 一键导入 flat 配置到 DB
  async function handleImportEnv() {
    setImporting(true);
    try {
      const res = await api<ImportEnvRes>("/api/admin/settings/models/import-env", { method: "POST" });
      setReloadKey((k) => k + 1);
      setImportOpen(false);
      const skipped = res.skipped_secret_fields?.length ?? 0;
      toast.success(
        `已导入 ${res.imported_fields?.length ?? 0} 项${skipped ? `，${skipped} 个空密钥已跳过` : ""}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="admin-page">
      <PageHeader
        description="渠道路由、运行参数、OSS / 易支付 / 计费与站点配置；密钥加密存库，留空保存不修改。"
        actions={
          <button
            type="button"
            className="admin-quick-btn !inline-flex !w-auto items-center gap-2 px-4 py-2.5"
            onClick={() => setImportOpen(true)}
          >
            <Download className="h-4 w-4" />
            从 .env 导入
          </button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn("admin-tab", tab === id && "is-active")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "routing" ? <RoutingSettingsPanel key={reloadKey} /> : null}
      {tab === "runtime" ? <RuntimeSettingsPanel key={reloadKey} /> : null}
      {tab === "oss" ? <OssSettingsPanel key={reloadKey} /> : null}
      {tab === "payment" ? <PaymentSettingsPanel key={reloadKey} /> : null}
      {tab === "site" ? <SiteSettingsPanel key={reloadKey} /> : null}

      <AdminConfirmDialog
        open={importOpen}
        title="从 .env 导入配置"
        description="将服务器当前环境变量 / backend/.env 中的 OSS、支付、模型密钥、运行参数等写入数据库并立即生效。已有 DB 配置会被覆盖；.env 中为空的密钥字段会跳过（保留库内原值）。"
        confirmLabel="开始导入"
        loading={importing}
        onOpenChange={setImportOpen}
        onConfirm={() => void handleImportEnv()}
      />
    </div>
  );
}
