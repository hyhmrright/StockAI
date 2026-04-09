import React from "react";
import { Key, Globe, Cpu } from "lucide-react";
import { Settings } from "../../hooks/useSettings";
import { FormInput } from "./FormInput";

interface OpenAIFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * OpenAI 配置表单组件
 */
export function OpenAIForm({ settings, onChange }: OpenAIFormProps): React.ReactElement {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <FormInput
        label="API Key"
        icon={<Key className="w-3 h-3" />}
        type="password"
        value={settings.apiKey}
        onChange={(v) => onChange({ apiKey: v })}
        placeholder="sk-..."
        hint="本地加密存储"
      />
      <FormInput
        label="接口地址 (Endpoint)"
        icon={<Globe className="w-3 h-3" />}
        value={settings.baseUrl}
        onChange={(v) => onChange({ baseUrl: v })}
        placeholder="https://api.openai.com/v1"
        mono
      />
      <FormInput
        label="模型名称"
        icon={<Cpu className="w-3 h-3" />}
        value={settings.aiModel}
        onChange={(v) => onChange({ aiModel: v })}
        placeholder="gpt-4o..."
        mono
      />
    </div>
  );
}
