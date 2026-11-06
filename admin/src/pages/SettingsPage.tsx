import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { OssSettingsPanel } from "@/components/settings/OssSettingsPanel";
import { PaymentSettingsPanel } from "@/components/settings/PaymentSettingsPanel";
import { RoutingSettingsPanel } from "@/components/settings/RoutingSettingsPanel";
import { RuntimeSettingsPanel } from "@/components/settings/RuntimeSettingsPanel";
import { SiteSettingsPanel } from "@/components/settings/SiteSettingsPanel";
import {
  SettingsSaveProvider,
  useSettingsSaveSlot,
} from "@/components/settings/SettingsSaveContext";
import { cn } from "@/lib/utils";

type SettingsTab = "routing" | "runtime" | "oss" | "payment" | "site";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "routing", label: "Model" },
  { id: "runtime", label: "Tham số chạy" },
  { id: "oss", label: "Lưu trữ OSS" },
  { id: "payment", label: "Thanh toán và tính phí" },
  { id: "site", label: "Công cụ site" },
];

// 页头：标题 + 统一保存按钮
function SettingsPageHeader() {
  const { action } = useSettingsSaveSlot();
  return (
    <header className="settings-page-hero">
      <div className="min-w-0">
        <h1 className="settings-page-title">Cài đặt hệ thống</h1>
        <p className="settings-head-desc">
          Quản lý model tạo, chạy tác vụ, kết nối lưu trữ, thanh toán tính phí và công cụ site.
        </p>
      </div>
      {action ? (
        <button
          type="button"
          className="admin-btn admin-btn-primary settings-save-btn"
          disabled={action.saving || action.disabled}
          onClick={() => void action.onSave()}
        >
          {action.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {action.label ?? "Lưu"}
        </button>
      ) : null}
    </header>
  );
}

// 系统设置内容区
function SettingsPageInner() {
  const [tab, setTab] = useState<SettingsTab>("routing");

  return (
    <div className="settings-page admin-page">
      <SettingsPageHeader />

      <div className="settings-tabs" role="tablist" aria-label="Phân vùng cài đặt hệ thống">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn("settings-tab", tab === id && "is-active")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-main">
        {tab === "routing" ? <RoutingSettingsPanel /> : null}
        {tab === "runtime" ? <RuntimeSettingsPanel /> : null}
        {tab === "oss" ? <OssSettingsPanel /> : null}
        {tab === "payment" ? <PaymentSettingsPanel /> : null}
        {tab === "site" ? <SiteSettingsPanel /> : null}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <SettingsSaveProvider>
      <SettingsPageInner />
    </SettingsSaveProvider>
  );
}
