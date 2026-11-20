import type { UsageEntry } from '../shared/usage';

// A conversation in which the model answers every turn by calling one tool: the shared interface the vector drawing
// loop uses, implemented by Claude (anthropic.ts) and OpenAI (openai.ts).

export type ChatBlock = { type: 'text'; text: string } | { type: 'image'; png: Buffer };

export interface ToolChatCall {
  /** The tool call's arguments. */
  input: unknown;
  /** The ledger entry of the request: tokens and cost. */
  usage: UsageEntry;
}

export interface ToolChat {
  provider: 'anthropic' | 'openai';
  model: string;
  /** The first send is the user's request; every later send is the result of the previous tool call. */
  /** `signal` cancels the request (and stops what the provider would still charge for, where it can). */
  send(blocks: ChatBlock[], signal?: AbortSignal): Promise<ToolChatCall>;
}

export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
