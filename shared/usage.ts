// Token telemetry shapes shared by the server ledger (server/usage.ts) and the usage panel.

export type UsageProvider = 'gemini' | 'openai' | 'voicestudio';
export type UsageKind = 'voice' | 'auto-tag' | 'transcribe' | 'image' | 'mouth';

export interface UsageEntry {
  at: string;
  provider: UsageProvider;
  model: string;
  kind: UsageKind;
  input: number | null; // prompt tokens (text, audio and image inputs)
  output: number | null; // generated tokens (audio and image outputs count here too)
  total: number | null;
}

export interface UsageTotals { calls: number; input: number; output: number; total: number; unreported: number }
export interface UsageRow extends UsageTotals { provider: UsageProvider; model: string }
export interface UsageReport { since: string; session: UsageTotals; sessionRows: UsageRow[]; allTime: UsageTotals; allTimeRows: UsageRow[]; recent: UsageEntry[] }
