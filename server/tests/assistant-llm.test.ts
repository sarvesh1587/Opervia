import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/db.js'
import type { AuthContext } from '../src/auth/permissions.js'
import { newWorkspace, stockedProduct } from './helpers.js'

/** The provider is replaced with a scripted fetch, so these tests exercise our handling, not Anthropic's API. */
type Reply = { status?: number; content?: unknown[]; throws?: string }
let script: Reply[] = []
const sent: { url: string; body: Record<string, unknown> }[] = []

let ask: (c: AuthContext, q: string) => Promise<{ mode: string; tool: string | null; summary: string; notice?: string; followUps: string[] }>
let ctx: AuthContext

beforeAll(async () => {
  const { c, email } = await newWorkspace('llm')
  await stockedProduct(c, 1, { reorder: 5 })
  const u = await prisma.user.findUniqueOrThrow({ where: { email } })
  ctx = { userId: u.id, businessId: u.businessId, role: u.role, name: u.name, email: u.email }

  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    sent.push({ url, body: JSON.parse(init.body) })
    const r = script.shift() ?? { status: 500 }
    if (r.throws) throw Object.assign(new Error(r.throws), { name: r.throws })
    return new Response(JSON.stringify({ content: r.content ?? [] }), { status: r.status ?? 200 })
  })
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.resetModules()
  ask = (await import('../src/modules/assistant/service.js')).ask
})
afterAll(async () => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; await prisma.$disconnect() })

const toolUse = (name: string, input: object = {}) => ({ type: 'tool_use', id: 't1', name, input })

describe('assistant with a language model', () => {
  it('uses the model to pick a tool and to explain the validated result', async () => {
    sent.length = 0
    script = [{ content: [toolUse('getLowStockProducts', { limit: 5 })] }, { content: [toolUse('respond', { summary: 'One product, Widget, is below its reorder level.', followUps: ['Draft a purchase order'] })] }]
    const a = await ask(ctx, 'what should I restock?')
    expect(a).toMatchObject({ mode: 'llm', tool: 'getLowStockProducts', summary: 'One product, Widget, is below its reorder level.', followUps: ['Draft a purchase order'] })
    expect(sent[0].url).toBe('https://api.anthropic.com/v1/messages')
    // Only the minimal tool result is sent for explanation — no contact details.
    expect(JSON.stringify(sent[1].body)).not.toMatch(/@/)
  })

  it('falls back to the tool’s own summary when the model’s reply is malformed', async () => {
    script = [{ content: [toolUse('getLowStockProducts')] }, { content: [toolUse('respond', { followUps: 'nope' })] }]
    const a = await ask(ctx, 'what should I restock?')
    expect(a.mode).toBe('offline')
    expect(a.tool).toBe('getLowStockProducts')
    expect(a.summary).toMatch(/at or below the reorder level/)
    expect(a.notice).toMatch(/expected format/)
  })

  it('keeps answering from rules when the provider fails or times out', async () => {
    script = [{ status: 503 }]
    const a = await ask(ctx, 'Which products need restocking?')
    expect(a).toMatchObject({ mode: 'offline', tool: 'getLowStockProducts' })
    expect(a.notice).toMatch(/returned 503/)
    script = [{ throws: 'AbortError' }]
    const b = await ask(ctx, 'Which products need restocking?')
    expect(b.notice).toMatch(/did not respond in time/)
  })

  it('refuses questions the model marks as unsupported, and ignores invented tools', async () => {
    script = [{ content: [toolUse('unsupportedQuestion')] }]
    expect((await ask(ctx, 'write a poem')).tool).toBeNull()
    script = [{ content: [toolUse('dropAllTables')] }]
    const r = await ask(ctx, 'do something odd')
    expect(r.tool).toBeNull()
  })
})
