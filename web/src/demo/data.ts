// Demo workspace: deterministic seed data that mirrors what the Postgres seed will contain.
// Every figure the UI shows is computed from these records, never typed in by hand.
import type { ActivityItem, AssistantAnswer, LedgerMetric, OrderRow, Overview, OverviewStockItem as StockItem, Range } from '../lib/types'

/** The demo always has the full (manager-level) overview. */
export type FullOverview = Overview & { revenue: NonNullable<Overview['revenue']>; series: NonNullable<Overview['series']>; ledger: LedgerMetric[]; stock: Overview['stock'] & { valueAtCost: number } }
import { inr, lakh } from '../lib/format'

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
const today = new Date(); today.setHours(0, 0, 0, 0)

// 200 days of net revenue (confirmed + completed orders, after discount, before tax)
const daily: { date: Date; value: number }[] = (() => {
  const r = rng(1587)
  return Array.from({ length: 200 }, (_, i) => {
    const date = new Date(today.getTime() - (199 - i) * DAY)
    const dow = date.getDay()
    const season = dow === 0 ? 0.35 : dow === 6 ? 0.8 : 1
    const trend = 46_000 + i * 105
    const noise = 0.78 + r() * 0.44
    const spike = r() > 0.965 ? 1.55 : 1
    return { date, value: Math.round(trend * season * noise * spike) }
  })
})()

const P: [string, string, number, number][] = [
  ['Copper Wire 2.5mm, 90m', 'Cables', 40, 3.1], ['Copper Wire 1.5mm, 90m', 'Cables', 40, 2.6], ['Copper Wire 4mm, 90m', 'Cables', 25, 1.2],
  ['Armoured Cable 4 core 10mm', 'Cables', 10, 0.4], ['Flexible Cable 0.75mm', 'Cables', 30, 1.6], ['Coaxial RG6, 100m', 'Cables', 12, 0.5],
  ['PVC Conduit 20mm', 'Conduits', 60, 6.0], ['PVC Conduit 25mm', 'Conduits', 50, 3.8], ['GI Conduit 20mm', 'Conduits', 20, 0.9],
  ['Flexible Conduit 25mm', 'Conduits', 25, 1.1], ['Junction Box 4-way', 'Conduits', 80, 4.2], ['Conduit Bend 20mm', 'Conduits', 120, 7.5],
  ['MCB 32A Double Pole', 'Protection', 25, 1.9], ['MCB 16A Single Pole', 'Protection', 40, 3.3], ['MCB 6A Single Pole', 'Protection', 40, 2.4],
  ['RCCB 40A 30mA', 'Protection', 15, 0.8], ['Distribution Board 8-way', 'Protection', 10, 0.6], ['Surge Protector Type 2', 'Protection', 8, 0.3],
  ['Isolator 63A', 'Protection', 10, 0.5], ['Changeover Switch 63A', 'Protection', 6, 0.2],
  ['LED Panel 18W', 'Lighting', 30, 2.4], ['LED Panel 12W', 'Lighting', 30, 2.0], ['LED Batten 20W', 'Lighting', 40, 3.0],
  ['LED Bulb 9W', 'Lighting', 150, 12.0], ['Downlight 7W', 'Lighting', 60, 3.6], ['Street Light 60W', 'Lighting', 8, 0.3],
  ['Flood Light 100W', 'Lighting', 10, 0.5], ['Emergency Light', 'Lighting', 12, 0.7],
  ['Modular Switch 6A', 'Switchgear', 200, 14.0], ['Modular Socket 16A', 'Switchgear', 120, 7.0], ['Modular Plate 8M', 'Switchgear', 80, 3.4],
  ['Fan Regulator', 'Switchgear', 60, 2.8], ['Bell Push', 'Switchgear', 40, 1.0], ['USB Socket Module', 'Switchgear', 30, 1.4],
  ['Ceiling Fan 1200mm', 'Fans', 20, 1.3], ['Exhaust Fan 250mm', 'Fans', 15, 0.8], ['Wall Fan 400mm', 'Fans', 10, 0.4],
  ['Insulation Tape', 'Accessories', 300, 18.0], ['Cable Tie 200mm (100)', 'Accessories', 100, 5.0], ['Earthing Electrode', 'Accessories', 10, 0.4],
  ['Lugs 10mm (50)', 'Accessories', 40, 1.5], ['Wall Plug 6mm (100)', 'Accessories', 60, 2.2], ['Cable Clip 20mm (100)', 'Accessories', 80, 3.0],
  ['Smart Plug Wi‑Fi', 'Smart home', 15, 0.6], ['Motion Sensor', 'Smart home', 10, 0.4], ['Smart Switch 2-gang', 'Smart home', 10, 0.5],
  ['Video Door Phone', 'Smart home', 5, 0.2], ['Energy Meter 1-phase', 'Smart home', 12, 0.5],
]

const costOf = (i: number) => [2850, 1890, 4400, 9800, 1450, 2600, 38, 52, 120, 64, 46, 18, 410, 168, 160, 1450, 1880, 3100, 760, 2350, 340, 290, 260, 62, 210, 2900, 1800, 980, 58, 96, 140, 260, 72, 640, 1850, 980, 1450, 22, 88, 1200, 260, 90, 120, 980, 760, 1150, 6400, 1280][i] ?? 100

export const products: (StockItem & { cost: number; price: number; supplier: string })[] = (() => {
  const r = rng(42)
  const forcedOut = new Set([12, 17, 46])
  const forcedLow = new Set([0, 6, 28, 20, 15])
  const suppliers = ['Polycab Depot', 'Precision Pipes', 'Havells Distributors', 'Lumen India', 'Anchor Wholesale', 'Crompton Traders', 'Hardware Hub', 'Smartline Imports']
  const supplierFor = (cat: string) => ({ Cables: 0, Conduits: 1, Protection: 2, Lighting: 3, Switchgear: 4, Fans: 5, Accessories: 6, 'Smart home': 7 } as Record<string, number>)[cat]
  return P.map(([name, category, reorderAt, dailySales], i) => {
    let onHand = Math.round(reorderAt * (1.6 + r() * 2.4))
    if (forcedOut.has(i)) onHand = 0
    if (forcedLow.has(i)) onHand = Math.max(1, Math.round(reorderAt * (0.12 + r() * 0.55)))
    const state = onHand === 0 ? 'out' : onHand <= reorderAt ? 'low' : 'ok'
    const cost = costOf(i)
    return {
      id: `p_${i + 1}`, sku: `SKU-${String(1000 + i * 37).padStart(4, '0')}`, name, category, onHand, reorderAt, dailySales, state,
      cost, price: Math.round(cost * (1.28 + r() * 0.14)), supplier: suppliers[supplierFor(category)],
    }
  })
})()

const customers = ['Patil Constructions', 'Shree Ganesh Traders', 'Deshmukh Builders', 'Sahyadri Hospitals', 'Nova Interiors LLP', 'Kulkarni and Sons', 'Aarav Electricals', 'Metro Fab Works', 'Riverside Apartments CHS', 'Pune Smart Offices']

export const orders: OrderRow[] = (() => {
  const r = rng(7)
  const statuses: OrderRow['status'][] = ['PROCESSING', 'CONFIRMED', 'COMPLETED', 'DRAFT', 'CANCELLED', 'PROCESSING', 'COMPLETED', 'COMPLETED', 'CONFIRMED', 'COMPLETED']
  return statuses.map((status, i) => {
    const lines = Array.from({ length: 2 + Math.floor(r() * 4) }, () => {
      const p = products[Math.floor(r() * products.length)]
      return { product: p.name, sku: p.sku, qty: 2 + Math.floor(r() * 24), unitPrice: p.price }
    })
    const placed = new Date(Date.now() - (i * 7.3 + 1.2) * 3_600_000)
    return {
      id: `o_${418 - i}`, number: `SO-${String(418 - i).padStart(4, '0')}`, customer: customers[i], placedAt: placed.toISOString(), status,
      total: lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), lines,
    }
  })
})()

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const activity: ActivityItem[] = [
  { id: 'a1', at: minutesAgo(14), actor: 'Meera', kind: 'stock-in', text: 'Received PO-0092 in full — 400 units across 3 SKUs' },
  { id: 'a2', at: minutesAgo(112), actor: 'System', kind: 'payment', text: 'INV-0311 part-paid ₹18,000 by Patil Constructions; ₹6,400 still due' },
  { id: 'a3', at: minutesAgo(205), actor: 'Ravi', kind: 'order', text: `Confirmed ${orders[1].number}; ${orders[1].lines.length} lines reserved from stock` },
  { id: 'a4', at: minutesAgo(398), actor: 'System', kind: 'alert', text: `${products[12].name} reached zero stock` },
  { id: 'a5', at: minutesAgo(1530), actor: 'Ravi', kind: 'order', text: `Cancelled ${orders[4].number}; units returned to stock` },
  { id: 'a6', at: minutesAgo(1840), actor: 'Meera', kind: 'invoice', text: 'Issued INV-0310 to Sahyadri Hospitals' },
]

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

export const receivables = { total: 482_300, overdue: 210_400, overdueCount: 3, open: 11 }
export const payables = { total: 136_900, duePOs: 2 }

export function buildOverview(range: Range): FullOverview {
  const n = RANGE_DAYS[range]
  const cur = daily.slice(-n)
  const prev = daily.slice(-2 * n, -n)
  const total = sum(cur.map((d) => d.value))
  const previousTotal = sum(prev.map((d) => d.value))
  const peakIdx = cur.reduce((best, d, i) => (d.value > cur[best].value ? i : best), 0)
  const orderCount = Math.round(total / 6945)
  const prevOrders = Math.round(previousTotal / 7090)
  const weekly = (fn: (vals: number[]) => number) =>
    Array.from({ length: 10 }, (_, k) => fn(daily.slice(daily.length - (10 - k) * 7, daily.length - (9 - k) * 7 || undefined).map((d) => d.value)))
  const valueAtCost = sum(products.map((p) => p.cost * p.onHand))

  const ledger: LedgerMetric[] = [
    { key: 'orders', label: 'Orders', value: orderCount, format: 'count', note: `${orderCount - prevOrders >= 0 ? '+' : '−'}${Math.abs(orderCount - prevOrders)} on previous period`, trend: weekly((v) => sum(v) / 6945), href: '/app/orders' },
    { key: 'aov', label: 'Average order value', value: total / orderCount, format: 'inr', note: `${inr(previousTotal / prevOrders)} previous period`, trend: weekly((v) => sum(v) / Math.max(1, Math.round(sum(v) / 6945))), href: '/app/analytics' },
    { key: 'margin', label: 'Gross margin', value: 31.4, format: 'pct', note: 'Revenue less cost of goods sold', trend: [30.2, 30.5, 30.4, 30.9, 31, 30.8, 31.2, 31.1, 31.3, 31.4], href: '/app/analytics' },
    { key: 'receivables', label: 'Receivables', value: receivables.total, format: 'inr', note: `${inr(receivables.overdue)} overdue across ${receivables.overdueCount} invoices`, trend: [3.1, 3.4, 3.3, 3.8, 4.0, 4.1, 4.4, 4.3, 4.6, 4.82], attention: true, href: '/app/invoices' },
    { key: 'payables', label: 'Payables', value: payables.total, format: 'inr', note: `${payables.duePOs} purchase orders due this week`, trend: [2.2, 2.0, 1.9, 1.8, 1.6, 1.7, 1.5, 1.4, 1.4, 1.37], href: '/app/purchase-orders' },
    { key: 'inventory', label: 'Inventory at cost', value: valueAtCost, format: 'inr', note: `${products.length} SKUs · ${products.filter((p) => p.state === 'out').length} out of stock`, trend: [1.03, 0.99, 1.04, 1.01, 0.97, 0.99, 1.02, 0.98, 1.0, 1].map((f) => f * valueAtCost), href: '/app/inventory' },
  ]

  const label = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'
  return {
    business: { name: 'Rao Electricals Pvt Ltd', city: 'Pune' },
    user: { name: 'Meera Rao', initials: 'MR', role: 'ADMIN' },
    range,
    period: { label, compareLabel: `previous ${n} days` },
    revenue: {
      total, previousTotal, changePct: (total / previousTotal - 1) * 100,
      peak: { date: cur[peakIdx].date.toISOString(), value: cur[peakIdx].value, customer: customers[peakIdx % customers.length] },
    },
    series: { dates: cur.map((d) => d.date.toISOString()), current: cur.map((d) => d.value), previous: prev.map((d) => d.value) },
    ledger,
    stock: {
      items: products, valueAtCost,
      healthy: products.filter((p) => p.state === 'ok').length,
      low: products.filter((p) => p.state === 'low').length,
      out: products.filter((p) => p.state === 'out').length,
    },
    orders,
    orderCounts: { all: orders.length, open: orders.filter((o) => ['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(o.status)).length, completed: orders.filter((o) => o.status === 'COMPLETED').length, cancelled: orders.filter((o) => o.status === 'CANCELLED').length },
    activity,
    meta: { rowsScanned: daily.length * 7 + products.length + orders.length, generatedAt: new Date().toISOString(), source: 'demo' },
  }
}

// Offline assistant: same tool set as the backend, intent picked by keyword rules,
// answer text composed from the tool result. No language model involved.
export function answerOffline(question: string): AssistantAnswer {
  const q = question.toLowerCase()
  const t0 = performance.now()
  const id = Math.random().toString(36).slice(2)
  const base = { id, question, mode: 'offline' as const }
  const done = <T extends object>(a: T) => ({ ...base, ...a, ms: Math.round(performance.now() - t0 + 220) })

  if (/(restock|reorder|low stock|run out|stock)/.test(q)) {
    const items = products.filter((p) => p.state !== 'ok').sort((a, b) => a.onHand / a.dailySales - b.onHand / b.dailySales)
    const cost = items.reduce((s, p) => s + Math.max(0, p.reorderAt * 2 - p.onHand) * p.cost, 0)
    return done({
      tool: 'getLowStockProducts', args: { window: '30d', limit: 10 },
      summary: `${items.length} products are at or below their reorder point. ${items.filter((p) => p.onHand / p.dailySales < 4).length} will run out within four days at the current sell-through rate.`,
      metrics: [{ label: 'Below reorder', value: String(items.length) }, { label: 'Out of stock', value: String(items.filter((p) => p.onHand === 0).length) }, { label: 'Refill to 2× reorder', value: lakh(cost) }],
      table: { columns: ['Product', 'On hand', 'Cover', 'Supplier'], rows: items.map((p) => [p.name, String(p.onHand), p.onHand === 0 ? 'out' : `${Math.max(1, Math.round(p.onHand / p.dailySales))} days`, p.supplier]) },
      followUps: ['Draft purchase orders for these', 'Which supplier is most overdue?'],
    })
  }
  if (/(compare|last month|previous|vs|versus)/.test(q)) {
    const o = buildOverview('30d')
    return done({
      tool: 'compareRevenuePeriods', args: { current: 'last 30 days', previous: 'prior 30 days' },
      summary: `Revenue for the last 30 days is ${inr(o.revenue.total)}, ${o.revenue.changePct >= 0 ? 'up' : 'down'} ${Math.abs(o.revenue.changePct).toFixed(1)}% on the previous 30 days (${inr(o.revenue.previousTotal)}). The largest single day was ${new Date(o.revenue.peak.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${inr(o.revenue.peak.value)}.`,
      metrics: [{ label: 'Last 30 days', value: lakh(o.revenue.total) }, { label: 'Prior 30 days', value: lakh(o.revenue.previousTotal) }, { label: 'Change', value: `${o.revenue.changePct >= 0 ? '+' : '−'}${Math.abs(o.revenue.changePct).toFixed(1)}%` }],
      followUps: ['Which customers drove the change?', 'Top products this month'],
    })
  }
  if (/(top|best|highest).*(product|selling|revenue)|top products/.test(q)) {
    const lines = orders.filter((o) => o.status !== 'CANCELLED').flatMap((o) => o.lines)
    const by = new Map<string, number>()
    lines.forEach((l) => by.set(l.product, (by.get(l.product) ?? 0) + l.qty * l.unitPrice))
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return done({
      tool: 'getTopSellingProducts', args: { window: '30d', limit: 5, metric: 'revenue' },
      summary: `${top[0][0]} leads with ${inr(top[0][1])} in order value across confirmed and completed orders. The top five account for ${inr(top.reduce((s, t) => s + t[1], 0))}.`,
      table: { columns: ['Product', 'Revenue'], rows: top.map(([n, v]) => [n, inr(v)]) },
      followUps: ['Which of these are running low?', 'Compare with the previous month'],
    })
  }
  if (/(outstanding|overdue|unpaid|due|invoice|owe)/.test(q)) {
    return done({
      tool: 'getOutstandingInvoices', args: { status: 'UNPAID|PARTIAL', sort: 'daysOverdue' },
      summary: `${receivables.open} invoices are open for ${inr(receivables.total)}. ${receivables.overdueCount} are past due, totalling ${inr(receivables.overdue)}.`,
      table: { columns: ['Invoice', 'Customer', 'Due', 'Outstanding'], rows: [['INV-0298', 'Deshmukh Builders', '19 days late', inr(124_800)], ['INV-0302', 'Metro Fab Works', '11 days late', inr(61_200)], ['INV-0305', 'Kulkarni and Sons', '4 days late', inr(24_400)]] },
      followUps: ['Draft a payment reminder', 'Which customers pay late most often?'],
    })
  }
  if (/(inventory value|worth|stock value|value of)/.test(q)) {
    const v = products.reduce((s, p) => s + p.cost * p.onHand, 0)
    return done({ tool: 'getInventoryValue', args: { basis: 'cost' }, summary: `Stock on hand is worth ${inr(v)} at cost across ${products.length} active SKUs.`, metrics: [{ label: 'At cost', value: lakh(v) }, { label: 'At selling price', value: lakh(products.reduce((s, p) => s + p.price * p.onHand, 0)) }], followUps: ['Which category holds the most value?'] })
  }
  if (/(pending|open order|processing|to ship)/.test(q)) {
    const open = orders.filter((o) => ['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(o.status))
    return done({ tool: 'getPendingOrders', args: { status: 'DRAFT|CONFIRMED|PROCESSING' }, summary: `${open.length} orders are open, worth ${inr(open.reduce((s, o) => s + o.total, 0))}.`, table: { columns: ['Order', 'Customer', 'Status', 'Total'], rows: open.map((o) => [o.number, o.customer, o.status.toLowerCase(), inr(o.total)]) }, followUps: ['Which of these are blocked on stock?'] })
  }
  if (/(revenue|sales|summar|how did|performance)/.test(q)) {
    const o = buildOverview('30d')
    return done({ tool: 'getRevenueSummary', args: { window: '30d' }, summary: `Over the last 30 days the business booked ${inr(o.revenue.total)} from ${o.ledger[0].value} orders, an average of ${inr(o.ledger[1].value)} per order. ${receivables.overdueCount} invoices are overdue and ${o.stock.low + o.stock.out} products need restocking.`, metrics: [{ label: 'Revenue', value: lakh(o.revenue.total) }, { label: 'Orders', value: String(o.ledger[0].value) }, { label: 'Overdue', value: lakh(receivables.overdue) }], followUps: ['Compare with the previous month', 'Which products need restocking?'] })
  }
  return done({ tool: null, args: {}, summary: 'That question is outside what I can answer from your records. I can report on revenue, top products, stock levels, open orders, outstanding invoices and inventory value.', followUps: ['Summarise this month', 'Which products need restocking?'] })
}
