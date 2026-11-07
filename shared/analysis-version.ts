import type { ModelChoice } from './types';
export const ANALYSIS_VERSION = 'research-v1';
export function analysisModelFingerprint(brain: ModelChoice, quick: ModelChoice): string {
  return `${brain.provider}:${brain.model}|${quick.provider}:${quick.model}|${ANALYSIS_VERSION}`;
}
