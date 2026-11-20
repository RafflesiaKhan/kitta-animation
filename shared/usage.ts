// Token telemetry shapes shared by the server ledger (server/usage.ts) and the usage panel.

export type UsageProvider = 'gemini' | 'openai' | 'voicestudio' | 'anthropic';
export type UsageKind = 'voice' | 'auto-tag' | 'direct' | 'transcribe' | 'image' | 'mouth' | 'draw';

export interface UsageEntry {
  at: string;
  provider: UsageProvider;
  model: string;
  kind: UsageKind;
  input: number | null; // prompt tokens (text, audio and image inputs)
  output: number | null; // generated tokens (audio and image outputs count here too)
  total: number | null;
  /** USD, priced when recorded (shared/prices.ts); null: no price for the model or no tokens reported. Missing on lines written before costs were tracked. */
  cost?: number | null;
}

/** cost is in USD. unpriced: calls with no cost (no price or no tokens). estimated: older calls priced from input/output alone. */
export interface UsageTotals { calls: number; input: number; output: number; total: number; unreported: number; cost: number; unpriced: number; estimated: number }
export interface UsageRow extends UsageTotals { provider: UsageProvider; model: string }
export interface UsageReport { since: string; session: UsageTotals; sessionRows: UsageRow[]; allTime: UsageTotals; allTimeRows: UsageRow[]; recent: UsageEntry[] }
