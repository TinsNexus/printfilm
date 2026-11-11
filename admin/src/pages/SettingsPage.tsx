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
import { tr } from "@/i18n";

type SettingsTab = "routing" | "runtime" | "oss" | "payment" | "site";

// 只存 labelKey，渲染时翻译（模块级常量不能存已翻译文字）
const TABS: { id: SettingsTab; labelKey: string }[] = [
  { id: "routing", labelKey: "settingsUi.tabModels" },
  { id: "runtime", labelKey: "settingsUi.tabRuntime" },
  { id: "oss", labelKey: "settingsUi.tabOss" },
  { id: "payment", labelKey: "settingsUi.tabPayment" },
  { id: "site", labelKey: "settingsUi.tabSite" },
];

// 页头：标题 + 统一保存按钮
function SettingsPageHeader() {
  const { action } = useSettingsSaveSlot();
  return (
    <header className="settings-page-hero">
      <div className="min-w-0">
        <h1 className="settings-page-title">{tr("settingsUi.pageTitle")}</h1>
        <p className="settings-head-desc">
          {tr("settingsUi.pageDesc")}
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
          {action.label ?? tr("settingsUi.save")}
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

      <div className="settings-tabs" role="tablist" aria-label={tr("settingsUi.sections")}>
        {TABS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn("settings-tab", tab === id && "is-active")}
            onClick={() => setTab(id)}
          >
            {tr(labelKey)}
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
