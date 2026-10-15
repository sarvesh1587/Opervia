import { prisma, Prisma } from '../../db.js'
import { can, type AuthContext } from '../../auth/permissions.js'
import { stockState, unitsSold } from '../products/service.js'

/**
 * Metric definitions (shared by the dashboard, analytics page and assistant tools)
 * - Revenue: confirmed, processing and completed orders, subtotal minus discount, before tax, dated by confirmation.
 * - Cost of goods: unit cost captured on each order line × quantity, for the same orders.
 * - Outstanding: invoice total minus recorded payments for unpaid and partly paid invoices.
 * - Inventory value: units on hand × current cost price, active products only.
 * Days are bucketed in the business time zone.
 */
export const TZ = 'Asia/Kolkata'
const REVENUE_STATUSES = Prisma.sql`('CONFIRMED','PROCESSING','COMPLETED')`
const localDay = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date`

export const MAX_RANGE_DAYS = 366
const DAY = 86_400_000
/** Today's date in the business time zone, as YYYY-MM-DD. */
export const todayLocal = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1
/** UTC bounds that cover a local date range (used so indexes on confirmedAt still apply). */
const utcBounds = (from: string, to: string) => ({ lo: new Date(Date.parse(from + 'T00:00:00Z') - 6 * 3_600_000), hi: new Date(Date.parse(to + 'T00:00:00Z') + DAY + 6 * 3_600_000) })

const n = (v: Prisma.Decimal | number | bigint | null | undefined) => Number(v ?? 0)

export async function revenueSummary(businessId: string, from: string, to: string) {
  const { lo, hi } = utcBounds(from, to)
  const [r] = await prisma.$queryRaw<{ revenue: Prisma.Decimal | null; orders: bigint; cogs: Prisma.Decimal | null; units: bigint | null }[]>(Prisma.sql`
    SELECT SUM(o."subtotal" - o."discount") AS revenue, COUNT(*) AS orders,
           SUM((SELECT SUM(i."unitCost" * i."quantity") FROM "SalesOrderItem" i WHERE i."salesOrderId" = o."id")) AS cogs,
           SUM((SELECT SUM(i."quantity") FROM "SalesOrderItem" i WHERE i."salesOrderId" = o."id")) AS units
    FROM "SalesOrder" o
    WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES}
      AND o."confirmedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`o."confirmedAt"`)} BETWEEN ${from}::date AND ${to}::date`)
  const revenue = n(r.revenue), orders = Number(r.orders), cogs = n(r.cogs)
  return { revenue, orders, aov: orders ? revenue / orders : 0, cogs, grossProfit: revenue - cogs, margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0, unitsSold: Number(r.units ?? 0) }
}

export async function revenueSeries(businessId: string, from: string, to: string, interval: 'day' | 'week' | 'month' = 'day') {
  const { lo, hi } = utcBounds(from, to)
  const step = Prisma.raw(`'1 ${interval}'`)
  const unit = Prisma.raw(`'${interval}'`)
  const rows = await prisma.$queryRaw<{ bucket: Date; revenue: Prisma.Decimal | null; orders: bigint; purchases: Prisma.Decimal | null }[]>(Prisma.sql`
    WITH buckets AS (SELECT date_trunc(${unit}, d)::date AS bucket FROM generate_series(${from}::date, ${to}::date, ${step}::interval) d GROUP BY 1),
    sales AS (
      SELECT date_trunc(${unit}, ${localDay(Prisma.sql`o."confirmedAt"`)})::date AS bucket, SUM(o."subtotal" - o."discount") AS revenue, COUNT(*) AS orders
      FROM "SalesOrder" o WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES}
        AND o."confirmedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`o."confirmedAt"`)} BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1),
    purchases AS (
      SELECT date_trunc(${unit}, ${localDay(Prisma.sql`po."orderedAt"`)})::date AS bucket, SUM(po."subtotal") AS purchases
      FROM "PurchaseOrder" po WHERE po."businessId" = ${businessId} AND po."status" IN ('ORDERED','PARTIALLY_RECEIVED','RECEIVED')
        AND po."orderedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`po."orderedAt"`)} BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1)
    SELECT b.bucket, s.revenue, COALESCE(s.orders, 0) AS orders, p.purchases
    FROM buckets b LEFT JOIN sales s ON s.bucket = b.bucket LEFT JOIN purchases p ON p.bucket = b.bucket ORDER BY b.bucket`)
  return rows.map((r) => ({ date: r.bucket.toISOString().slice(0, 10), revenue: n(r.revenue), orders: Number(r.orders), purchases: n(r.purchases) }))
}

export async function topProducts(businessId: string, from: string, to: string, limit = 10, metric: 'revenue' | 'quantity' = 'revenue') {
  const { lo, hi } = utcBounds(from, to)
  const rows = await prisma.$queryRaw<{ id: string; sku: string; name: string; revenue: Prisma.Decimal; quantity: bigint; profit: Prisma.Decimal }[]>(Prisma.sql`
    SELECT p."id", p."sku", p."name",
      SUM(i."lineTotal" * CASE WHEN o."subtotal" > 0 THEN (o."subtotal" - o."discount") / o."subtotal" ELSE 1 END) AS revenue,
      SUM(i."quantity") AS quantity,
      SUM(i."lineTotal" * CASE WHEN o."subtotal" > 0 THEN (o."subtotal" - o."discount") / o."subtotal" ELSE 1 END - i."unitCost" * i."quantity") AS profit
    FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId" JOIN "Product" p ON p."id" = i."productId"
    WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES}
      AND o."confirmedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`o."confirmedAt"`)} BETWEEN ${from}::date AND ${to}::date
    GROUP BY p."id", p."sku", p."name"
    ORDER BY ${metric === 'quantity' ? Prisma.sql`quantity` : Prisma.sql`revenue`} DESC LIMIT ${limit}`)
  return rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, revenue: Math.round(n(r.revenue) * 100) / 100, quantity: Number(r.quantity), profit: Math.round(n(r.profit) * 100) / 100 }))
}

export async function topCustomers(businessId: string, from: string, to: string, limit = 5) {
  const { lo, hi } = utcBounds(from, to)
  const rows = await prisma.$queryRaw<{ id: string; name: string; revenue: Prisma.Decimal; orders: bigint }[]>(Prisma.sql`
    SELECT c."id", c."name", SUM(o."subtotal" - o."discount") AS revenue, COUNT(*) AS orders
    FROM "SalesOrder" o JOIN "Customer" c ON c."id" = o."customerId"
    WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES}
      AND o."confirmedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`o."confirmedAt"`)} BETWEEN ${from}::date AND ${to}::date
    GROUP BY c."id", c."name" ORDER BY revenue DESC LIMIT ${limit}`)
  return rows.map((r) => ({ id: r.id, name: r.name, revenue: n(r.revenue), orders: Number(r.orders) }))
}

export async function categoryBreakdown(businessId: string, from: string, to: string) {
  const { lo, hi } = utcBounds(from, to)
  const rows = await prisma.$queryRaw<{ name: string | null; revenue: Prisma.Decimal }[]>(Prisma.sql`
    SELECT cat."name", SUM(i."lineTotal" * CASE WHEN o."subtotal" > 0 THEN (o."subtotal" - o."discount") / o."subtotal" ELSE 1 END) AS revenue
    FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId" JOIN "Product" p ON p."id" = i."productId" LEFT JOIN "Category" cat ON cat."id" = p."categoryId"
    WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES}
      AND o."confirmedAt" BETWEEN ${lo} AND ${hi} AND ${localDay(Prisma.sql`o."confirmedAt"`)} BETWEEN ${from}::date AND ${to}::date
    GROUP BY cat."name" ORDER BY revenue DESC`)
  return rows.map((r) => ({ category: r.name ?? 'Uncategorised', revenue: Math.round(n(r.revenue) * 100) / 100 }))
}

export async function receivables(businessId: string) {
  const [r] = await prisma.$queryRaw<{ outstanding: Prisma.Decimal | null; overdue: Prisma.Decimal | null; overdueCount: bigint; openCount: bigint }[]>(Prisma.sql`
    SELECT SUM("total" - "amountPaid") AS outstanding,
           SUM("total" - "amountPaid") FILTER (WHERE "dueDate" < NOW()) AS overdue,
           COUNT(*) FILTER (WHERE "dueDate" < NOW()) AS "overdueCount", COUNT(*) AS "openCount"
    FROM "Invoice" WHERE "businessId" = ${businessId} AND "status" IN ('UNPAID','PARTIALLY_PAID')`)
  return { outstanding: n(r.outstanding), overdue: n(r.overdue), overdueCount: Number(r.overdueCount), openCount: Number(r.openCount) }
}

export async function openPurchases(businessId: string) {
  const [r] = await prisma.$queryRaw<{ value: Prisma.Decimal | null; count: bigint }[]>(Prisma.sql`
    SELECT SUM((i."quantity" - i."receivedQty") * i."unitCost") AS value, COUNT(DISTINCT po."id") AS count
    FROM "PurchaseOrder" po JOIN "PurchaseOrderItem" i ON i."purchaseOrderId" = po."id"
    WHERE po."businessId" = ${businessId} AND po."status" IN ('ORDERED','PARTIALLY_RECEIVED')`)
  return { value: n(r.value), count: Number(r.count) }
}

export async function inventoryValue(businessId: string) {
  const [r] = await prisma.$queryRaw<{ cost: Prisma.Decimal | null; retail: Prisma.Decimal | null; skus: bigint; units: bigint | null }[]>(Prisma.sql`
    SELECT SUM("stockQty" * "costPrice") AS cost, SUM("stockQty" * "sellingPrice") AS retail, COUNT(*) AS skus, SUM("stockQty") AS units
    FROM "Product" WHERE "businessId" = ${businessId} AND "status" = 'ACTIVE'`)
  return { atCost: n(r.cost), atRetail: n(r.retail), skus: Number(r.skus), units: Number(r.units ?? 0) }
}

/** Ten weekly points for each ledger metric, reconstructed from history rather than stored snapshots. */
async function weeklyTrends(businessId: string) {
  const rows = await prisma.$queryRaw<{ wk: Date; revenue: Prisma.Decimal | null; orders: bigint; cogs: Prisma.Decimal | null; receivable: Prisma.Decimal | null; openpo: Prisma.Decimal | null; stock: Prisma.Decimal | null }[]>(Prisma.sql`
    WITH weeks AS (SELECT generate_series(0, 9) AS k),
    ends AS (SELECT k, (NOW() - ((9 - k) * INTERVAL '7 days')) AS t FROM weeks)
    SELECT e.t AS wk,
      (SELECT SUM(o."subtotal" - o."discount") FROM "SalesOrder" o WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES} AND o."confirmedAt" > e.t - INTERVAL '7 days' AND o."confirmedAt" <= e.t) AS revenue,
      (SELECT COUNT(*) FROM "SalesOrder" o WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES} AND o."confirmedAt" > e.t - INTERVAL '7 days' AND o."confirmedAt" <= e.t) AS orders,
      (SELECT SUM(i."unitCost" * i."quantity") FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId" WHERE o."businessId" = ${businessId} AND o."status" IN ${REVENUE_STATUSES} AND o."confirmedAt" > e.t - INTERVAL '7 days' AND o."confirmedAt" <= e.t) AS cogs,
      (SELECT COALESCE(SUM(v."total"), 0) FROM "Invoice" v WHERE v."businessId" = ${businessId} AND v."status" <> 'VOID' AND v."issueDate" <= e.t)
        - (SELECT COALESCE(SUM(p."amount"), 0) FROM "Payment" p WHERE p."businessId" = ${businessId} AND p."paidAt" <= e.t) AS receivable,
      (SELECT COALESCE(SUM(po."subtotal"), 0) FROM "PurchaseOrder" po WHERE po."businessId" = ${businessId} AND po."orderedAt" <= e.t AND (po."cancelledAt" IS NULL OR po."cancelledAt" > e.t))
        - (SELECT COALESCE(SUM(m."quantity" * i."unitCost"), 0) FROM "InventoryMovement" m
             JOIN "PurchaseOrder" po ON po."businessId" = m."businessId" AND po."number" = m."reference"
             JOIN "PurchaseOrderItem" i ON i."purchaseOrderId" = po."id" AND i."productId" = m."productId"
           WHERE m."businessId" = ${businessId} AND m."type" = 'PURCHASE_RECEIPT' AND m."createdAt" <= e.t AND po."orderedAt" <= e.t) AS openpo,
      (SELECT SUM(pr."costPrice" * (pr."stockQty" - COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m WHERE m."productId" = pr."id" AND m."createdAt" > e.t), 0)))
         FROM "Product" pr WHERE pr."businessId" = ${businessId} AND pr."status" = 'ACTIVE') AS stock
    FROM ends e ORDER BY e.k`)
  return {
    orders: rows.map((r) => Number(r.orders)),
    aov: rows.map((r) => (Number(r.orders) ? n(r.revenue) / Number(r.orders) : 0)),
    margin: rows.map((r) => (n(r.revenue) ? ((n(r.revenue) - n(r.cogs)) / n(r.revenue)) * 100 : 0)),
    receivables: rows.map((r) => n(r.receivable)),
    openPurchases: rows.map((r) => n(r.openpo)),
    inventory: rows.map((r) => n(r.stock)),
  }
}

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type Range = keyof typeof RANGE_DAYS

const activityKind = (action: string) =>
  action.startsWith('payment') ? 'payment' : action === 'stock.depleted' ? 'alert' : action.startsWith('purchaseOrder.received') || action.startsWith('stock') ? 'stock-in' : action.startsWith('invoice') ? 'invoice' : 'order'

/** The dashboard payload. Staff receive the operational sections only; financial figures are omitted server-side. */
export async function overview(c: AuthContext, range: Range) {
  const days = RANGE_DAYS[range]
  const to = todayLocal(), from = addDays(to, -(days - 1))
  const pTo = addDays(from, -1), pFrom = addDays(pTo, -(days - 1))
  const financial = can(c.role, 'analytics:read')

  const [business, user, products, recentOrders, logs] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: c.businessId }, select: { name: true, city: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: c.userId }, select: { name: true, role: true } }),
    prisma.product.findMany({ where: { businessId: c.businessId, status: 'ACTIVE' }, orderBy: { name: 'asc' }, take: 96, include: { category: { select: { name: true } } } }),
    prisma.salesOrder.findMany({ where: { businessId: c.businessId }, orderBy: { createdAt: 'desc' }, take: 10, include: { customer: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true } } } } } }),
    prisma.auditLog.findMany({ where: { businessId: c.businessId, action: { notIn: ['workspace.created'] } }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } }),
  ])
  const sold = await unitsSold(c.businessId, products.map((p) => p.id))
  const items = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category?.name ?? 'Uncategorised', onHand: p.stockQty, reorderAt: p.reorderLevel, dailySales: (sold.get(p.id) ?? 0) / 30, state: stockState(p) }))
  const [counts] = await prisma.$queryRaw<{ ok: bigint; low: bigint; out: bigint; value: Prisma.Decimal | null }[]>(Prisma.sql`
    SELECT COUNT(*) FILTER (WHERE "stockQty" > "reorderLevel") AS ok, COUNT(*) FILTER (WHERE "stockQty" > 0 AND "stockQty" <= "reorderLevel") AS low,
           COUNT(*) FILTER (WHERE "stockQty" = 0) AS out, SUM("stockQty" * "costPrice") AS value
    FROM "Product" WHERE "businessId" = ${c.businessId} AND "status" = 'ACTIVE'`)
  const initials = user.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()
  const orders = recentOrders.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, placedAt: o.createdAt.toISOString(), status: o.status, total: n(o.total), lines: o.items.map((i) => ({ product: i.product.name, sku: i.product.sku, qty: i.quantity, unitPrice: n(i.unitPrice) })) }))

  const base = {
    business: { name: business.name, city: business.city ?? '' },
    user: { name: user.name, initials, role: user.role },
    range,
    period: { label: `Last ${days} days`, compareLabel: `previous ${days} days` },
    stock: { items, healthy: Number(counts.ok), low: Number(counts.low), out: Number(counts.out), valueAtCost: financial ? n(counts.value) : null },
    orders,
    orderCounts: { all: orders.length, open: orders.filter((o) => ['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(o.status)).length, completed: orders.filter((o) => o.status === 'COMPLETED').length, cancelled: orders.filter((o) => o.status === 'CANCELLED').length },
    activity: logs.map((l) => ({ id: l.id, at: l.createdAt.toISOString(), actor: l.user?.name.split(' ')[0] ?? 'System', kind: activityKind(l.action), text: l.summary })),
  }
  if (!financial) {
    return { ...base, revenue: null, series: null, ledger: null, meta: { rowsScanned: products.length + recentOrders.length + logs.length, generatedAt: new Date().toISOString(), source: 'api' as const, scope: 'operational' as const } }
  }

  const [cur, prev, series, prevSeries, recv, openPo, inv, trends] = await Promise.all([
    revenueSummary(c.businessId, from, to), revenueSummary(c.businessId, pFrom, pTo),
    revenueSeries(c.businessId, from, to), revenueSeries(c.businessId, pFrom, pTo),
    receivables(c.businessId), openPurchases(c.businessId), inventoryValue(c.businessId), weeklyTrends(c.businessId),
  ])
  const peakIdx = series.reduce((best, d, i) => (d.revenue > series[best].revenue ? i : best), 0)
  const peakDay = series[peakIdx]?.date ?? to
  const peakCustomer = (await topCustomers(c.businessId, peakDay, peakDay, 1))[0]?.name ?? '—'
  const diff = cur.orders - prev.orders

  return {
    ...base,
    revenue: { total: cur.revenue, previousTotal: prev.revenue, changePct: prev.revenue ? (cur.revenue / prev.revenue - 1) * 100 : 0, peak: { date: peakDay, value: series[peakIdx]?.revenue ?? 0, customer: peakCustomer } },
    series: { dates: series.map((s) => s.date), current: series.map((s) => s.revenue), previous: prevSeries.map((s) => s.revenue) },
    ledger: [
      { key: 'orders', label: 'Orders', value: cur.orders, format: 'count', note: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} on the previous period`, trend: trends.orders, href: '/app/orders' },
      { key: 'aov', label: 'Average order value', value: cur.aov, format: 'inr', note: `₹${Math.round(prev.aov).toLocaleString('en-IN')} previous period`, trend: trends.aov, href: '/app/analytics' },
      { key: 'margin', label: 'Gross margin', value: cur.margin, format: 'pct', note: 'Revenue less cost of goods sold', trend: trends.margin, href: '/app/analytics' },
      { key: 'receivables', label: 'Receivables', value: recv.outstanding, format: 'inr', note: recv.overdueCount ? `₹${Math.round(recv.overdue).toLocaleString('en-IN')} overdue across ${recv.overdueCount} invoice${recv.overdueCount === 1 ? '' : 's'}` : `${recv.openCount} open invoices, none overdue`, trend: trends.receivables, attention: recv.overdueCount > 0, href: '/app/invoices' },
      { key: 'purchases', label: 'Open purchase orders', value: openPo.value, format: 'inr', note: `${openPo.count} order${openPo.count === 1 ? '' : 's'} awaiting delivery`, trend: trends.openPurchases, href: '/app/purchase-orders' },
      { key: 'inventory', label: 'Inventory at cost', value: inv.atCost, format: 'inr', note: `${inv.skus} SKUs · ${Number(counts.out)} out of stock`, trend: trends.inventory, href: '/app/inventory' },
    ],
    meta: { rowsScanned: cur.orders + prev.orders + products.length + recentOrders.length + logs.length, generatedAt: new Date().toISOString(), source: 'api' as const, scope: 'full' as const },
  }
}
