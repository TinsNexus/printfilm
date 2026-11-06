import { useState } from "react";
import { Check, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { LabeledControl } from "@/components/settings/SettingsPanel";
import { Button } from "@/components/ui/button";

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
  const status = clearPending ? "Xóa sau khi lưu" : hasDraft ? "Thông tin xác thực mới chờ lưu" : configured ? "Đã cấu hình" : "Chưa cấu hình";
  const inputRequired = required && !configured && !clearPending;
  const fieldError = error ?? (value.length > 0 && !hasDraft && !clearPending ? "Thông tin xác thực không được chỉ chứa khoảng trắng." : undefined);
  const guidance = clearPending
    ? "Hiện chỉ đánh dấu xóa, có hiệu lực sau khi lưu; có thể hủy việc xóa."
    : configured
      ? "Thông tin xác thực hiện có không hiển thị lại; để trống để giữ, nhập giá trị mới rồi lưu để thay thế."
      : "Nhập thông tin xác thực mới rồi lưu; nút hiển thị chỉ hiện nội dung vừa nhập.";
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
            placeholder={clearPending ? "Đã đánh dấu xóa" : placeholder ?? (configured ? "Để trống để giữ thông tin xác thực hiện có" : "Nhập thông tin xác thực mới")}
            value={clearPending ? "" : value}
            disabled={disabled || clearPending}
            required={inputRequired}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button type="button" variant="outline" size="icon" disabled={disabled || clearPending || !hasDraft}
            aria-label={`${visible ? "Ẩn" : "Hiện"}Mới ${label}`} aria-pressed={visible}
            title={visible ? "Ẩn nội dung vừa nhập" : "Hiện nội dung vừa nhập"} onClick={() => setVisible((current) => !current)}>
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
