import { useState } from "react";
import { OssSettingsPanel } from "@/components/settings/OssSettingsPanel";
import { PaymentSettingsPanel } from "@/components/settings/PaymentSettingsPanel";
import { RoutingSettingsPanel } from "@/components/settings/RoutingSettingsPanel";
import { RuntimeSettingsPanel } from "@/components/settings/RuntimeSettingsPanel";
import { SiteSettingsPanel } from "@/components/settings/SiteSettingsPanel";
import { cn } from "@/lib/utils";

type SettingsTab = "routing" | "runtime" | "oss" | "payment" | "site";

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

  return (
    <div className="settings-page admin-page">
      <div className="settings-head">
        <p className="settings-head-desc">
          渠道路由、运行参数、OSS / 易支付 / 计费与站点配置；密钥加密存库，留空保存不修改。
        </p>
        <div className="settings-tabs" role="tablist" aria-label="系统设置分区">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn("admin-tab settings-tab", tab === id && "is-active")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
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
