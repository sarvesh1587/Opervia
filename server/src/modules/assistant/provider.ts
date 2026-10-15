import { z } from 'zod'
import { env } from '../../config/env.js'

/** Thin Anthropic Messages API client. The key never leaves the server. */
export class ProviderError extends Error {
  kind: 'not_configured' | 'timeout' | 'rate_limited' | 'http' | 'malformed'
  constructor(kind: ProviderError['kind'], message: string) { super(message); this.kind = kind }
}

interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
interface Message { role: 'user' | 'assistant'; content: string }

async function call(body: Record<string, unknown>) {
  if (!env.aiConfigured) throw new ProviderError('not_configured', 'No AI provider key is configured.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), env.AI_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.AI_MODEL, max_tokens: 600, temperature: 0, ...body }),
    })
    if (res.status === 429) throw new ProviderError('rate_limited', 'The AI provider is rate limiting requests.')
    if (!res.ok) throw new ProviderError('http', `The AI provider returned ${res.status}.`)
    return (await res.json()) as { content: { type: string; name?: string; input?: unknown; text?: string }[] }
  } catch (e) {
    if (e instanceof ProviderError) throw e
    if ((e as Error).name === 'AbortError') throw new ProviderError('timeout', 'The AI provider did not respond in time.')
    throw new ProviderError('http', 'The AI provider could not be reached.')
  } finally {
    clearTimeout(timer)
  }
}

/** Forces the model to answer by calling exactly one of the given tools; returns that tool call. */
export async function forceToolCall(system: string, messages: Message[], tools: ToolDef[], toolName?: string) {
  const r = await call({ system, messages, tools, tool_choice: toolName ? { type: 'tool', name: toolName } : { type: 'any' } })
  const use = r.content.find((b) => b.type === 'tool_use')
  if (!use?.name) throw new ProviderError('malformed', 'The AI provider did not choose a tool.')
  return { name: use.name, input: use.input as Record<string, unknown> }
}

export const explanationSchema = z.object({
  summary: z.string().min(1).max(900),
  followUps: z.array(z.string().min(3).max(120)).max(3).default([]),
})
