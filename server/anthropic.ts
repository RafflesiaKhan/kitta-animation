import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlockParam, BetaMessage, BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { UsageEntry } from '../shared/usage';
import type { ChatBlock, ToolChat, ToolSpec } from './tool-chat';
import { recordAnthropic, type UsageKind } from './usage';

// Claude, the drawing model for vector characters (version 2 planning/vector-create-plan.md): one long request with
// pictures that must answer by calling one tool. Key: ANTHROPIC_API_KEY; model: ANTHROPIC_MODEL.

export class AnthropicError extends Error {
  constructor(public code: 'no_key' | 'bad_key' | 'no_credit' | 'rate_limited' | 'busy' | 'refused' | 'too_long' | 'no_tool' | 'unreachable' | 'failed', detail?: string) {
    super(detail ? `Claude: ${code} (${detail})` : `Claude: ${code}`);
  }
}

export const anthropicModel = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const MAX_TOKENS = 128_000; // a whole vector.json in one tool call can be very long

export const imageBlock = (png: Buffer) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: png.toString('base64') } });

export interface ToolCall { input: unknown; toolUseId: string; message: BetaMessage; usage: UsageEntry }

/**
 * Sends the conversation and returns the model's call of `tool`. Opus 5.5 does not accept a forced tool_choice, so
 * the tool is offered with `auto` and the system prompt must say to call it; an answer without the call is `no_tool`.
 * Streams (long outputs), caches the growing prefix between rounds, and lets a refusal fall back to another model.
 */
export async function callTool(opts: { system: string; messages: BetaMessageParam[]; tool: BetaTool; kind?: UsageKind; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; model?: string; signal?: AbortSignal }): Promise<ToolCall> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AnthropicError('no_key');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = opts.model ?? anthropicModel();
  let message: BetaMessage;
  try {
    message = await client.beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral', ttl: '1h' }, // a drawing round takes longer than the default 5 min
      output_config: { effort: opts.effort ?? 'high' },
      system: opts.system,
      tools: [{ ...opts.tool, eager_input_streaming: true }],
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: opts.messages,
    }, { signal: opts.signal }).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw new DOMException('Cancelled', 'AbortError');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AnthropicError('bad_key');
    if (e instanceof Anthropic.RateLimitError) throw new AnthropicError('rate_limited');
    if (e instanceof Anthropic.InternalServerError) throw new AnthropicError('busy');
    if (e instanceof Anthropic.APIConnectionError) throw new AnthropicError('unreachable');
    if (e instanceof Anthropic.APIError && /credit balance/i.test(e.message)) throw new AnthropicError('no_credit');
    if (e instanceof Anthropic.APIError) throw new AnthropicError('failed', e.message);
    throw e;
  }
  const usage = recordAnthropic(opts.kind ?? 'draw', message.model ?? model, message.usage);
  if (message.stop_reason === 'refusal') throw new AnthropicError('refused', message.stop_details?.category ?? undefined);
  if (message.stop_reason === 'max_tokens') throw new AnthropicError('too_long');
  const call = message.content.find((b) => b.type === 'tool_use' && b.name === opts.tool.name);
  if (!call || call.type !== 'tool_use') throw new AnthropicError('no_tool');
  return { input: call.input, toolUseId: call.id, message, usage };
}

const toBlock = (b: ChatBlock): BetaContentBlockParam => (b.type === 'text' ? { type: 'text', text: b.text } : imageBlock(b.png));

/** A drawing conversation with Claude. The assistant turns are kept whole (thinking blocks must go back unchanged). */
export function claudeToolChat(system: string, tool: ToolSpec, model = anthropicModel()): ToolChat {
  const messages: BetaMessageParam[] = [];
  const spec: BetaTool = { name: tool.name, description: tool.description, input_schema: { type: 'object', ...tool.parameters } };
  let lastCall: string | null = null;
  return {
    provider: 'anthropic',
    model,
    async send(blocks, signal) {
      const content = blocks.map(toBlock);
      messages.push({ role: 'user', content: lastCall ? [{ type: 'tool_result', tool_use_id: lastCall, content: content as never }] : content });
      const call = await callTool({ system, messages: [...messages], tool: spec, model, signal });
      messages.push({ role: 'assistant', content: call.message.content as BetaContentBlockParam[] });
      lastCall = call.toolUseId;
      return { input: call.input, usage: call.usage };
    },
  };
}
