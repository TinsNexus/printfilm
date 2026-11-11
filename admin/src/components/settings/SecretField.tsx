import { useState } from "react";
import { Check, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { LabeledControl } from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";
import { tr } from "@/i18n";

type SecretFieldProps = {
  label: string;
  hint?: string;
  value: string;
  configured: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearPending?: boolean;
  onUndoClear?: () => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
};

// Only the new draft can be revealed; existing secrets are never loaded into this field.
export function SecretField({
  label,
  hint,
  value,
  configured,
  placeholder,
  onChange,
  onClear,
  clearPending = false,
  onUndoClear,
  disabled = false,
  required = false,
  error,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false);
  const hasDraft = value.trim().length > 0;
  const status = clearPending ? tr("settingsUi.clearAfterSave") : hasDraft ? tr("settingsUi.newSecretPending") : configured ? tr("settingsUi.configured") : tr("settingsUi.notConfigured");
  const inputRequired = required && !configured && !clearPending;
  const fieldError = error ?? (value.length > 0 && !hasDraft && !clearPending ? tr("settingsUi.secretBlank") : undefined);
  const guidance = clearPending
    ? tr("settingsUi.clearPendingHint")
    : configured
      ? tr("settingsUi.configuredHint")
      : tr("settingsUi.newSecretHint");
  return (
    <LabeledControl
      label={label}
      hint={[hint, guidance].filter(Boolean).join(" ")}
      required={inputRequired}
      error={fieldError}
    >
      <div className="admin-secret-field">
        <div className="admin-secret-field-row settings-secret-row">
          <input
            type={visible && !clearPending ? "text" : "password"}
            className="settings-input is-secret"
            placeholder={clearPending ? tr("settingsUi.markedForClear") : placeholder ?? (configured ? tr("settingsUi.leaveBlankKeep") : tr("settingsUi.enterNewSecret"))}
            value={clearPending ? "" : value}
            disabled={disabled || clearPending}
            required={inputRequired}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button type="button" variant="outline" size="icon" disabled={disabled || clearPending || !hasDraft}
            aria-label={tr(visible ? "settingsUi.hideNewSecret" : "settingsUi.showNewSecret", { label })} aria-pressed={visible}
            title={visible ? tr("settingsUi.hideInput") : tr("settingsUi.showInput")} onClick={() => setVisible((current) => !current)}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
          {clearPending && onUndoClear ? <Button type="button" variant="outline" disabled={disabled} onClick={onUndoClear}>
            <RotateCcw size={14} />Hoàn tác
          </Button> : (configured || hasDraft) && onClear ? <Button type="button" variant="outline" disabled={disabled} onClick={() => { setVisible(false); onClear(); }}>
            <Trash2 size={14} />Xóa
          </Button> : null}
        </div>
        <span className="admin-secret-status inline-flex items-center gap-1" role="status">
          {configured && !clearPending && !hasDraft ? <Check size={12} /> : null}{status}
        </span>
      </div>
    </LabeledControl>
  );
}
