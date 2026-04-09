import React from "react";

interface FormInputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  mono?: boolean;
  hint?: string;
  suffix?: React.ReactNode;
}

/**
 * 设置表单通用输入框
 */
export function FormInput({
  label, icon, value, onChange, placeholder, type = "text", mono, hint, suffix,
}: FormInputProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          {icon} {label}
        </label>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      <div className="relative group">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${mono ? "font-mono" : ""}`}
        />
        {suffix}
      </div>
    </div>
  );
}
