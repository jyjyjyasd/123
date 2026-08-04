import { autoResizeTextarea } from "./chat-utils";

export interface VisualKnownFieldProps {
  accent: string;
  hasStyleRef: boolean;
  value: string;
  disabled: boolean;
  onChangeValue: (value: string) => void;
  onSave: (value: string) => void;
}

const NO_STYLE_VALUES = ["not-provided", "not provided", "未提供", "暂无", "无"];

export function VisualKnownField({
  accent,
  hasStyleRef,
  value,
  disabled,
  onChangeValue,
  onSave,
}: VisualKnownFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
        <span style={{ fontWeight: 600, color: "#37352f", fontSize: 13, marginTop: 2 }}>已知：</span>
        <textarea
          key={hasStyleRef ? "ref" : value}
          defaultValue={hasStyleRef ? "风格参考图" : value}
          placeholder="未提供风格描述，可在此自主填写..."
          disabled={disabled}
          onChange={(e) => {
            onChangeValue(e.target.value);
            autoResizeTextarea(e.target);
            const v = e.target.value.trim().toLowerCase();
            const isNoVal = NO_STYLE_VALUES.includes(v);
            e.target.style.color = isNoVal ? "#8e8e8e" : "#4a4a47";
          }}
          onBlur={(e) => {
            onSave(e.target.value.trim());
          }}
          rows={1}
          ref={(el) => {
            autoResizeTextarea(el);
          }}
          style={{
            flex: 1,
            fontSize: 13,
            lineHeight: "1.6",
            color: (hasStyleRef || NO_STYLE_VALUES.includes((hasStyleRef ? "风格参考图" : value).trim().toLowerCase())) ? "#8e8e8e" : "#4a4a47",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            padding: 0,
            margin: 0,
            fontFamily: "inherit",
            borderBottom: "1px dashed rgba(55,53,47,0.2)",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderBottomColor = accent;
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderBottomColor = "rgba(55,53,47,0.2)";
          }}
        />
      </div>
    </div>
  );
}
