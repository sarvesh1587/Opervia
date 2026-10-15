import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import { can, type AuthContext, type Permission } from '../../auth/permissions.js'
import { addDays, daysBetween, inventoryValue, receivables, revenueSummary, todayLocal, topProducts } from '../analytics/service.js'
import { unitsSold } from '../products/service.js'

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
const lakh = (v: number) => (Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : inr(v))

export const PERIODS = ['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'last_90_days'] as const
export type Period = (typeof PERIODS)[number]
const period = z.enum(PERIODS).default('last_30_days')

/** Resolves a named period to local dates. Ranges are fixed and bounded, so a tool can never scan unbounded history. */
export function resolvePeriod(p: Period) {
  const t = todayLocal()
  const [y, m] = t.split('-').map(Number)
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
  switch (p) {
    case 'today': return { from: t, to: t, label: 'today' }
    case 'last_7_days': return { from: addDays(t, -6), to: t, label: 'the last 7 days' }
    case 'this_month': return { from: firstOfMonth, to: t, label: 'this month so far' }
    case 'last_month': { const end = addDays(firstOfMonth, -1); return { from: end.slice(0, 8) + '01', to: end, label: 'last month' } }
    case 'last_90_days': return { from: addDays(t, -89), to: t, label: 'the last 90 days' }
    default: return { from: addDays(t, -29), to: t, label: 'the last 30 days' }
  }
}
const previousOf = (r: { from: string; to: string }) => { const d = daysBetween(r.from, r.to); const to = addDays(r.from, -1); return { from: addDays(to, -(d - 1)), to } }

export interface ToolResult {
  data: Record<string, unknown>
  summary: string
  metrics?: { label: string; value: string }[]
  table?: { columns: string[]; rows: string[][] }
  followUps: string[]
}
export interface Tool<A extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  permission: Permission
  args: A
  jsonSchema: Record<string, unknown>
  run: (c: AuthContext, args: z.infer<A>) => Promise<ToolResult>
}
// Keeps each tool's run() typed against its own argument schema.
const defineTool = <A extends z.ZodTypeAny>(t: Tool<A>) => t as unknown as Tool

const periodJson = { type: 'string', enum: PERIODS, description: 'Reporting period' }

export const TOOLS: Tool[] = [
  defineTool({
    name: 'getRevenueSummary', permission: 'analytics:read',
    description: 'Revenue, order count, average order value and gross margin for a period. Use for summaries of sales or business performance.',
    args: z.object({ period }), jsonSchema: { type: 'object', properties: { period: periodJson } },
    run: async (c, a) => {
      const r = resolvePeriod(a.period)
      const [s, recv] = await Promise.all([revenueSummary(c.businessId, r.from, r.to), receivables(c.businessId)])
      return {
        data: { period: r, revenue: s.revenue, orders: s.orders, averageOrderValue: Math.round(s.aov), grossMarginPct: Math.round(s.margin * 10) / 10, unitsSold: s.unitsSold, outstandingReceivables: recv.outstanding, overdueInvoices: recv.overdueCount },
        summary: `In ${r.label} the business booked ${inr(s.revenue)} from ${s.orders} orders, an average of ${inr(s.aov)} per order at a ${s.margin.toFixed(1)}% gross margin. ${recv.overdueCount} invoice${recv.overdueCount === 1 ? ' is' : 's are'} overdue.`,
        metrics: [{ label: 'Revenue', value: lakh(s.revenue) }, { label: 'Orders', value: String(s.orders) }, { label: 'Gross margin', value: `${s.margin.toFixed(1)}%` }],
        followUps: ['Compare with the previous period', 'Top products by revenue'],
      }
    },
  }),
  defineTool({
    name: 'compareRevenuePeriods', permission: 'analytics:read',
    description: 'Compares revenue and orders for a period against the previous period of equal length (e.g. this month vs last month).',
    args: z.object({ period }), jsonSchema: { type: 'object', properties: { period: periodJson } },
    run: async (c, a) => {
      const r = resolvePeriod(a.period), p = previousOf(r)
      const [cur, prev] = await Promise.all([revenueSummary(c.businessId, r.from, r.to), revenueSummary(c.businessId, p.from, p.to)])
      const change = prev.revenue ? (cur.revenue / prev.revenue - 1) * 100 : null
      return {
        data: { current: { ...r, revenue: cur.revenue, orders: cur.orders }, previous: { ...p, revenue: prev.revenue, orders: prev.orders }, changePct: change && Math.round(change * 10) / 10 },
        summary: change == null ? `Revenue for ${r.label} is ${inr(cur.revenue)}; there were no sales in the previous period to compare with.` : `Revenue for ${r.label} is ${inr(cur.revenue)}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% on the previous ${daysBetween(r.from, r.to)} days (${inr(prev.revenue)}). Orders went from ${prev.orders} to ${cur.orders}.`,
        metrics: [{ label: 'Current', value: lakh(cur.revenue) }, { label: 'Previous', value: lakh(prev.revenue) }, { label: 'Change', value: change == null ? '—' : `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%` }],
        followUps: ['Top products by revenue', 'Summarise the last 30 days'],
      }
    },
  }),
  defineTool({
    name: 'getTopSellingProducts', permission: 'analytics:read',
    description: 'Best-selling products in a period, ranked by revenue (default) or units.',
    args: z.object({ period, limit: z.coerce.number().int().min(1).max(10).default(5), metric: z.enum(['revenue', 'quantity']).default('revenue') }),
    jsonSchema: { type: 'object', properties: { period: periodJson, limit: { type: 'integer', minimum: 1, maximum: 10 }, metric: { type: 'string', enum: ['revenue', 'quantity'] } } },
    run: async (c, a) => {
      const r = resolvePeriod(a.period)
      const top = await topProducts(c.businessId, r.from, r.to, a.limit, a.metric)
      if (!top.length) return { data: { period: r, products: [] }, summary: `No products were sold in ${r.label}.`, followUps: ['Summarise the last 90 days'] }
      return {
        data: { period: r, metric: a.metric, products: top.map((t) => ({ name: t.name, revenue: t.revenue, units: t.quantity })) },
        summary: `${top[0].name} leads ${r.label} with ${a.metric === 'quantity' ? `${top[0].quantity} units` : inr(top[0].revenue)}. The top ${top.length} together account for ${inr(top.reduce((s, t) => s + t.revenue, 0))} in revenue.`,
        table: { columns: ['Product', 'Units', 'Revenue'], rows: top.map((t) => [t.name, String(t.quantity), inr(t.revenue)]) },
        followUps: ['Which of these are running low?', 'Compare with the previous period'],
      }
    },
  }),
  defineTool({
    name: 'getLowStockProducts', permission: 'products:read',
    description: 'Products at or below their reorder level, ordered by how soon they run out at the current sales rate. Use for restocking questions.',
    args: z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) }), jsonSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } } },
    run: async (c, a) => {
      const low = await prisma.product.findMany({ where: { businessId: c.businessId, status: 'ACTIVE', stockQty: { lte: prisma.product.fields.reorderLevel } }, include: { supplier: { select: { name: true } } } })
      const sold = await unitsSold(c.businessId, low.map((p) => p.id))
      const rows = low.map((p) => { const daily = (sold.get(p.id) ?? 0) / 30; return { p, cover: p.stockQty === 0 ? 0 : daily > 0 ? p.stockQty / daily : Infinity } })
        .sort((x, y) => x.cover - y.cover).slice(0, a.limit)
      const refill = rows.reduce((s, { p }) => s + Math.max(0, p.reorderLevel * 2 - p.stockQty) * Number(p.costPrice), 0)
      const soon = rows.filter((r) => r.cover < 4).length
      return {
        data: { count: low.length, outOfStock: low.filter((p) => p.stockQty === 0).length, products: rows.map(({ p, cover }) => ({ name: p.name, onHand: p.stockQty, reorderLevel: p.reorderLevel, daysOfCover: Number.isFinite(cover) ? Math.floor(cover) : null })) },
        summary: low.length === 0 ? 'Every active product is above its reorder level.' : `${low.length} product${low.length === 1 ? ' is' : 's are'} at or below the reorder level; ${soon} will run out within four days at the current sales rate.`,
        metrics: [{ label: 'Below reorder', value: String(low.length) }, { label: 'Out of stock', value: String(low.filter((p) => p.stockQty === 0).length) }, ...(can(c.role, 'analytics:read') ? [{ label: 'Refill to 2× reorder', value: lakh(refill) }] : [])],
        table: { columns: ['Product', 'On hand', 'Cover', 'Supplier'], rows: rows.map(({ p, cover }) => [p.name, String(p.stockQty), p.stockQty === 0 ? 'out' : Number.isFinite(cover) ? `${Math.max(1, Math.floor(cover))} days` : 'no recent sales', p.supplier?.name ?? '—']) },
        followUps: ['Which orders are still pending?', 'What is my inventory worth?'],
      }
    },
  }),
  defineTool({
    name: 'getPendingOrders', permission: 'salesOrders:read',
    description: 'Sales orders that are drafted, confirmed or being processed and not yet completed.',
    args: z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) }), jsonSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } } },
    run: async (c, a) => {
      const where: Prisma.SalesOrderWhereInput = { businessId: c.businessId, status: { in: ['DRAFT', 'CONFIRMED', 'PROCESSING'] } }
      const [open, agg] = await Promise.all([
        prisma.salesOrder.findMany({ where, orderBy: { createdAt: 'asc' }, take: a.limit, include: { customer: { select: { name: true } } } }),
        prisma.salesOrder.aggregate({ where, _sum: { total: true }, _count: true }),
      ])
      return {
        data: { count: agg._count, value: Number(agg._sum.total ?? 0), orders: open.map((o) => ({ number: o.number, customer: o.customer.name, status: o.status, total: Number(o.total), ageDays: Math.floor((Date.now() - o.createdAt.getTime()) / 86_400_000) })) },
        summary: agg._count === 0 ? 'There are no open orders.' : `${agg._count} order${agg._count === 1 ? ' is' : 's are'} open, worth ${inr(Number(agg._sum.total ?? 0))}. The oldest is ${open[0].number} for ${open[0].customer.name}.`,
        table: { columns: ['Order', 'Customer', 'Status', 'Total'], rows: open.map((o) => [o.number, o.customer.name, o.status.toLowerCase(), inr(Number(o.total))]) },
        followUps: ['Which products need restocking?', 'Which invoices are overdue?'],
      }
    },
  }),
  defineTool({
    name: 'getOutstandingInvoices', permission: 'invoices:read',
    description: 'Unpaid and partly paid invoices, with amounts outstanding and days overdue. Use for questions about dues, receivables or customers who owe money.',
    args: z.object({ limit: z.coerce.number().int().min(1).max(25).default(10), overdueOnly: z.coerce.boolean().default(false) }),
    jsonSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 }, overdueOnly: { type: 'boolean' } } },
    run: async (c, a) => {
      const [list, recv] = await Promise.all([
        prisma.invoice.findMany({ where: { businessId: c.businessId, status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, ...(a.overdueOnly ? { dueDate: { lt: new Date() } } : {}) }, orderBy: { dueDate: 'asc' }, take: a.limit, include: { customer: { select: { name: true } } } }),
        receivables(c.businessId),
      ])
      const late = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000)
      return {
        data: { openInvoices: recv.openCount, outstanding: recv.outstanding, overdue: recv.overdue, overdueCount: recv.overdueCount, invoices: list.map((i) => ({ number: i.number, customer: i.customer.name, outstanding: Number(i.total.minus(i.amountPaid)), daysOverdue: Math.max(0, late(i.dueDate)) })) },
        summary: recv.openCount === 0 ? 'Every invoice is paid.' : `${recv.openCount} invoice${recv.openCount === 1 ? ' is' : 's are'} open for ${inr(recv.outstanding)}. ${recv.overdueCount} ${recv.overdueCount === 1 ? 'is' : 'are'} past due, totalling ${inr(recv.overdue)}.`,
        metrics: [{ label: 'Outstanding', value: lakh(recv.outstanding) }, { label: 'Overdue', value: lakh(recv.overdue) }, { label: 'Overdue invoices', value: String(recv.overdueCount) }],
        table: { columns: ['Invoice', 'Customer', 'Due', 'Outstanding'], rows: list.map((i) => [i.number, i.customer.name, late(i.dueDate) > 0 ? `${late(i.dueDate)} days late` : `in ${-late(i.dueDate)} days`, inr(Number(i.total.minus(i.amountPaid)))]) },
        followUps: ['Summarise the last 30 days', 'Which orders are still pending?'],
      }
    },
  }),
  defineTool({
    name: 'getInventoryValue', permission: 'analytics:read',
    description: 'Value of stock on hand at cost and at selling price.',
    args: z.object({}), jsonSchema: { type: 'object', properties: {} },
    run: async (c) => {
      const v = await inventoryValue(c.businessId)
      return {
        data: v,
        summary: `Stock on hand is worth ${inr(v.atCost)} at cost (${inr(v.atRetail)} at selling price) across ${v.skus} active products and ${v.units.toLocaleString('en-IN')} units.`,
        metrics: [{ label: 'At cost', value: lakh(v.atCost) }, { label: 'At selling price', value: lakh(v.atRetail) }, { label: 'Units', value: v.units.toLocaleString('en-IN') }],
        followUps: ['Which products need restocking?', 'Top products by revenue'],
      }
    },
  }),
]

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name)
export const toolsFor = (c: AuthContext) => TOOLS.filter((t) => can(c.role, t.permission))

/** Rule-based routing used when no language model is configured or the provider fails. */
export function routeOffline(question: string): { tool: string; args: Record<string, unknown> } | null {
  const q = question.toLowerCase()
  const per: Period = /today/.test(q) ? 'today' : /last month|previous month/.test(q) ? 'last_month' : /this month|month/.test(q) ? 'this_month' : /week|7 days/.test(q) ? 'last_7_days' : /quarter|90 days|3 months/.test(q) ? 'last_90_days' : 'last_30_days'
  if (/(restock|reorder|low stock|low on|run(ning)? out|out of stock|stock coverage|coverage)/.test(q)) return { tool: 'getLowStockProducts', args: {} }
  if (/(compare|vs\.?|versus|than last|previous)/.test(q)) return { tool: 'compareRevenuePeriods', args: { period: per === 'last_month' ? 'this_month' : per } }
  if (/(top|best|highest|most).*(product|item|sell|revenue)|best[- ]selling/.test(q)) return { tool: 'getTopSellingProducts', args: { period: per, metric: /unit|quantity|volume/.test(q) ? 'quantity' : 'revenue' } }
  if (/(outstanding|overdue|unpaid|owe|dues|receivable|invoice|payment)/.test(q)) return { tool: 'getOutstandingInvoices', args: { overdueOnly: /overdue|late/.test(q) } }
  if (/(inventory value|stock value|worth|value of (my )?(stock|inventory))/.test(q)) return { tool: 'getInventoryValue', args: {} }
  if (/(pending|open order|processing|unfulfilled|not shipped|still)/.test(q) && /order/.test(q)) return { tool: 'getPendingOrders', args: {} }
  if (/(revenue|sales|summar|performance|how (did|are) we|business)/.test(q)) return { tool: 'getRevenueSummary', args: { period: per } }
  return null
}
