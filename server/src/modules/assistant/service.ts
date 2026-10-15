import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import type { AuthContext } from '../../auth/permissions.js'
import { logger } from '../../lib/logger.js'
import { explanationSchema, forceToolCall, ProviderError } from './provider.js'
import { routeOffline, toolByName, toolsFor, type ToolResult } from './tools.js'

const UNSUPPORTED = 'unsupportedQuestion'

const ROUTER_SYSTEM = `You route questions about a small business's operations to exactly one data tool.
Pick the single tool that answers the question. If no tool can answer it from the business's own records (general knowledge, advice unrelated to these records, requests to change data, or anything outside the listed tools), call ${UNSUPPORTED}.
Never invent tools or arguments. Prefer defaults when the question does not specify a period.`

const EXPLAIN_SYSTEM = `You are Opervia's analyst. Explain the DATA below to the business owner in 1–3 short, plain sentences.
Rules: use only figures present in DATA; do not estimate, extrapolate or add numbers; format money in Indian rupees (₹) with Indian digit grouping; no greetings, no markdown, no speculation about causes not in DATA.
Then suggest up to 3 short follow-up questions that the same tools could answer.`

export interface Answer {
  id: string; question: string; tool: string | null; args: Record<string, unknown>; summary: string
  metrics?: ToolResult['metrics']; table?: ToolResult['table']; followUps: string[]
  mode: 'llm' | 'offline'; ms: number; notice?: string
}

const noticeFor = (e: unknown) => e instanceof ProviderError
  ? e.kind === 'not_configured' ? undefined : `${e.message} This answer was built directly from the tool result.`
  : 'The AI provider failed. This answer was built directly from the tool result.'

export async function ask(c: AuthContext, question: string): Promise<Answer> {
  const t0 = Date.now()
  const id = randomUUID()
  const allowed = toolsFor(c)
  let mode: Answer['mode'] = env.aiConfigured ? 'llm' : 'offline'
  let notice: string | undefined

  // 1. Choose a tool: language model when configured, rules otherwise or on failure.
  let choice: { tool: string; args: Record<string, unknown> } | null = null
  if (env.aiConfigured) {
    try {
      const call = await forceToolCall(ROUTER_SYSTEM, [{ role: 'user', content: question }], [
        ...allowed.map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema })),
        { name: UNSUPPORTED, description: 'Use when no other tool can answer the question from the business records.', input_schema: { type: 'object', properties: {} } },
      ])
      choice = call.name === UNSUPPORTED ? null : { tool: call.name, args: call.input ?? {} }
    } catch (e) {
      mode = 'offline'; notice = noticeFor(e)
      logger.warn('assistant_router_failed', { error: (e as Error).message })
      choice = routeOffline(question)
    }
  } else {
    choice = routeOffline(question)
  }

  const base = { id, question, mode, ...(notice ? { notice } : {}) }
  if (!choice) {
    return { ...base, tool: null, args: {}, summary: 'I can only answer from your Opervia records: revenue and orders, best-selling products, stock that needs restocking, open orders, outstanding invoices and inventory value.', followUps: ['Summarise the last 30 days', 'Which products need restocking?'], ms: Date.now() - t0 }
  }

  // 2. Permission and argument checks happen on the server regardless of who chose the tool.
  const tool = toolByName(choice.tool)
  if (!tool) return { ...base, tool: null, args: {}, summary: 'That question could not be matched to a supported report.', followUps: [], ms: Date.now() - t0 }
  if (!allowed.includes(tool)) {
    return { ...base, tool: tool.name, args: {}, summary: 'Your role does not have access to the figures needed for this question. Ask an admin or manager.', followUps: allowed.some((t) => t.name === 'getLowStockProducts') ? ['Which products need restocking?'] : [], ms: Date.now() - t0 }
  }
  const parsed = tool.args.safeParse(choice.args)
  const args = (parsed.success ? parsed.data : tool.args.parse({})) as Record<string, unknown>
  const result = await tool.run(c, args)

  // 3. Explanation: the model only sees the minimal tool result, and its reply is schema-checked.
  let summary = result.summary
  let followUps = result.followUps
  if (mode === 'llm') {
    try {
      const out = await forceToolCall(EXPLAIN_SYSTEM, [{ role: 'user', content: `QUESTION: ${question}\n\nDATA (from ${tool.name}):\n${JSON.stringify(result.data)}` }], [{
        name: 'respond', description: 'Return the explanation.',
        input_schema: { type: 'object', properties: { summary: { type: 'string' }, followUps: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['summary'] },
      }], 'respond')
      const e = explanationSchema.parse(out.input)
      summary = e.summary
      if (e.followUps.length) followUps = e.followUps
    } catch (e) {
      mode = 'offline'
      logger.warn('assistant_explain_failed', { error: (e as Error).message })
      return { ...base, mode, notice: noticeFor(e instanceof ProviderError ? e : new ProviderError('malformed', 'The AI reply did not match the expected format.')), tool: tool.name, args, summary, metrics: result.metrics, table: result.table, followUps, ms: Date.now() - t0 }
    }
  }
  return { ...base, mode, tool: tool.name, args, summary, metrics: result.metrics, table: result.table, followUps, ms: Date.now() - t0 }
}
