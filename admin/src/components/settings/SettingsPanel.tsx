import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

// VOZEB 风格配置面板容器
export function SettingsPanel({ title, description, actions, children }: PanelProps) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div className="min-w-0">
          <h3 className="settings-panel-title">{title}</h3>
          <p className="settings-panel-desc">{description}</p>
        </div>
        {actions ? <div className="settings-panel-actions">{actions}</div> : null}
      </div>
      <div className="settings-panel-body">{children}</div>
    </section>
  );
}

// 带图标的区块标题
export function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="settings-section-title">
      <span className="settings-section-icon">{icon}</span>
      <span>{title}</span>
    </div>
  );
}

// 表单标签 + 控件
export function LabeledControl({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      {children}
      {hint ? <span className="settings-field-hint">{hint}</span> : null}
    </label>
  );
}

// 内嵌子面板（VOZEB settingsPanelSurfaceClass 风格）
export function SettingsSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`settings-surface ${className}`.trim()}>{children}</div>;
}
