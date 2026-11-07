import { useId, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import type { ResearchWorkspace } from '../../../shared/types';
export interface WorkspaceProps {
  state: ResearchWorkspace;
  symbol: string;
  change: (fn: (state: ResearchWorkspace) => ResearchWorkspace) => Promise<void>;
  run: (task: () => Promise<unknown>) => void;
}
export const inputClass =
  'w-full rounded-lg bg-background border border-white/15 p-2 text-sm text-gray-100';
export const buttonClass =
  'rounded-lg px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm';
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="block space-y-1 text-xs text-gray-400">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
export function SourceLink({ url, children }: { url?: string; children: ReactNode }) {
  return url && /^https?:\/\//i.test(url) ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
