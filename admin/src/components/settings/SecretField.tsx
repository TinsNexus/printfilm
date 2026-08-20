import { LabeledControl } from "@/components/settings/SettingsPanel";
import { cn } from "@/lib/utils";

type SecretFieldProps = {
  label: string;
  hint?: string;
  value: string;
  configured: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
};

// 密钥输入：留空不修改，支持清除已存密钥
export function SecretField({
  label,
  hint,
  value,
  configured,
  placeholder,
  onChange,
  onClear,
}: SecretFieldProps) {
  return (
    <LabeledControl
      label={label}
      hint={hint ?? (configured ? "已配置；留空保存则不修改，可点清除后保存" : undefined)}
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="password"
            className="settings-input flex-1"
            placeholder={placeholder ?? (configured ? "留空则不修改" : "填写密钥")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
          />
          {configured && onClear ? (
            <button type="button" className="admin-quick-btn shrink-0 px-3" onClick={onClear}>
              清除
            </button>
          ) : null}
        </div>
        {configured ? (
          <span className={cn("text-xs font-medium text-[#67c23a]")}>● 已配置</span>
        ) : null}
      </div>
    </LabeledControl>
  );
}
