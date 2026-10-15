import { Router } from 'express'
import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import { can, type AuthContext } from '../../auth/permissions.js'
import { audit } from '../../lib/audit.js'
import { nextNumber } from '../../lib/counter.js'
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { computeTotals } from '../../lib/money.js'
import { money, optionalText, pageQuery, qty, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idempotent } from '../../middleware/idempotency.js'
import { idParam, validate } from '../../middleware/validate.js'
import { applyStockChange } from '../products/service.js'

export const router = Router()

/**
 * Lifecycle and stock policy
 * DRAFT → CONFIRMED | CANCELLED · CONFIRMED → PROCESSING | COMPLETED | CANCELLED · PROCESSING → COMPLETED | CANCELLED
 * Stock is deducted when an order is confirmed and restored once if a confirmed order is cancelled.
 * `stockApplied` records whether the deduction is in effect, so restoring can never happen twice.
 */
export const TRANSITIONS = { DRAFT: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PROCESSING', 'COMPLETED', 'CANCELLED'], PROCESSING: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] } as const
type Status = keyof typeof TRANSITIONS

const include = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true, stockQty: true, status: true } } }, orderBy: { id: 'asc' } },
  invoice: { select: { id: true, number: true, status: true, total: true, amountPaid: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.SalesOrderInclude

async function getOr404(c: AuthContext, id: string) {
  const o = await prisma.salesOrder.findFirst({ where: { id, businessId: c.businessId }, include })
  if (!o) throw notFound('Sales order')
  const { items, ...rest } = o
  const showCost = can(c.role, 'analytics:read')
  return { ...rest, items: items.map(({ unitCost, ...i }) => (showCost ? { ...i, unitCost } : i)), allowedTransitions: TRANSITIONS[o.status] }
}

const itemsSchema = z.array(z.object({ productId: z.string().min(1).max(40), quantity: qty })).min(1, 'Add at least one line').max(100)
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, 'Each product can appear only once')
const draftBody = z.object({ customerId: z.string().min(1).max(40), items: itemsSchema, discount: money.default(0), notes: optionalText(500) })

/** Prices and costs come from the product records on the server, never from the client. */
async function buildLines(c: AuthContext, body: z.infer<typeof draftBody>) {
  const products = await prisma.product.findMany({ where: { businessId: c.businessId, id: { in: body.items.map((i) => i.productId) } } })
  if (products.length !== body.items.length) throw unprocessable('One or more products do not exist.')
  const archived = products.find((p) => p.status === 'ARCHIVED')
  if (archived) throw unprocessable(`${archived.name} is archived and cannot be sold.`)
  const byId = new Map(products.map((p) => [p.id, p]))
  const business = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId } })
  const lines = body.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: byId.get(i.productId)!.sellingPrice, unitCost: byId.get(i.productId)!.costPrice }))
  const t = computeTotals(lines, body.discount, business.taxRate)
  if (t.discount.greaterThan(t.subtotal)) throw unprocessable('Discount cannot exceed the subtotal.')
  return { lines: lines.map((l, i) => ({ ...l, lineTotal: t.lineTotals[i] })), totals: { subtotal: t.subtotal, discount: t.discount, taxRate: business.taxRate, taxAmount: t.taxAmount, total: t.total } }
}

const listQuery = z.object({
  ...pageQuery,
  status: z.enum(['DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'OPEN', 'ALL']).default('ALL'),
  customerId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['createdAt', 'total', 'number']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

router.get('/', requirePermission('salesOrders:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const where: Prisma.SalesOrderWhereInput = {
    businessId: c.businessId,
    ...(q.status === 'OPEN' ? { status: { in: ['DRAFT', 'CONFIRMED', 'PROCESSING'] } } : q.status !== 'ALL' ? { status: q.status } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  }
  const [items, total, counts] = await Promise.all([
    prisma.salesOrder.findMany({ where, orderBy: [{ [q.sort]: q.order }, { id: 'desc' }], ...skipTake(q.page, q.pageSize), include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true, status: true } }, _count: { select: { items: true } } } }),
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.groupBy({ by: ['status'], where: { businessId: c.businessId }, _count: true }),
  ])
  ok(res, { ...page(items.map(({ _count, ...o }) => ({ ...o, lineCount: _count.items })), total, q.page, q.pageSize), counts: Object.fromEntries(counts.map((x) => [x.status, x._count])) })
})

router.get('/:id', requirePermission('salesOrders:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const o = await getOr404(c, req.params.id as string)
  const history = await prisma.auditLog.findMany({ where: { businessId: c.businessId, entity: 'SalesOrder', entityId: o.id }, orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } })
  ok(res, { ...o, history })
})

router.post('/', requirePermission('salesOrders:write'), validate({ body: draftBody }), async (req, res) => {
  const c = ctx(req)
  const customer = await prisma.customer.findFirst({ where: { id: req.body.customerId, businessId: c.businessId } })
  if (!customer) throw unprocessable('Customer does not exist.')
  if (customer.status === 'INACTIVE') throw unprocessable('This customer is inactive.')
  const { lines, totals } = await buildLines(c, req.body)
  const id = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, c.businessId, 'SO')
    const o = await tx.salesOrder.create({ data: { businessId: c.businessId, number, customerId: customer.id, notes: req.body.notes, createdById: c.userId, ...totals, items: { create: lines } } })
    await audit(tx, c, { action: 'salesOrder.created', entity: 'SalesOrder', entityId: o.id, summary: `Drafted ${number} for ${customer.name}` })
    return o.id
  })
  ok(res, await getOr404(c, id), 201)
})

router.put('/:id', requirePermission('salesOrders:write'), validate({ params: idParam, body: draftBody }), async (req, res) => {
  const c = ctx(req)
  const o = await getOr404(c, req.params.id as string)
  if (o.status !== 'DRAFT') throw conflict('Only draft orders can be edited.')
  const customer = await prisma.customer.findFirst({ where: { id: req.body.customerId, businessId: c.businessId } })
  if (!customer) throw unprocessable('Customer does not exist.')
  const { lines, totals } = await buildLines(c, req.body)
  await prisma.$transaction(async (tx) => {
    const r = await tx.salesOrder.updateMany({ where: { id: o.id, businessId: c.businessId, status: 'DRAFT' }, data: { customerId: customer.id, notes: req.body.notes, ...totals } })
    if (r.count === 0) throw conflict('This order was confirmed by someone else.')
    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: o.id } })
    await tx.salesOrderItem.createMany({ data: lines.map((l) => ({ ...l, salesOrderId: o.id })) })
    await audit(tx, c, { action: 'salesOrder.updated', entity: 'SalesOrder', entityId: o.id, summary: `Edited draft ${o.number}` })
  })
  ok(res, await getOr404(c, o.id))
})

/** Confirm: claim the DRAFT row, then deduct each product with a conditional update inside the same transaction. */
router.post('/:id/confirm', requirePermission('salesOrders:write'), idempotent, validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const o = await getOr404(c, req.params.id as string)
  if (o.status !== 'DRAFT') throw conflict(`Order ${o.number} is already ${o.status.toLowerCase()}.`)
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.salesOrder.updateMany({ where: { id: o.id, businessId: c.businessId, status: 'DRAFT' }, data: { status: 'CONFIRMED', confirmedAt: new Date(), stockApplied: true } })
    if (claimed.count === 0) throw conflict(`Order ${o.number} was confirmed by someone else.`)
    const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: o.id }, orderBy: { productId: 'asc' } }) // stable lock order
    for (const i of items) await applyStockChange(tx, c, i.productId, -i.quantity, 'SALE', o.number)
    await audit(tx, c, { action: 'salesOrder.confirmed', entity: 'SalesOrder', entityId: o.id, summary: `Confirmed ${o.number}; ${items.length} lines reserved from stock` })
  })
  ok(res, await getOr404(c, o.id))
})

async function transition(c: AuthContext, id: string, to: Status) {
  const o = await getOr404(c, id)
  const from = o.status as Status
  if (!(TRANSITIONS[from] as readonly Status[]).includes(to)) throw conflict(`An order that is ${from.toLowerCase()} cannot move to ${to.toLowerCase()}.`, { allowed: TRANSITIONS[from] })
  await prisma.$transaction(async (tx) => {
    const now = new Date()
    if (to === 'CANCELLED') {
      if (from !== 'DRAFT' && !can(c.role, 'salesOrders:cancel')) throw forbidden('Only managers can cancel a confirmed order.')
      if (o.invoice && o.invoice.status !== 'VOID') throw conflict(`Order ${o.number} has invoice ${o.invoice.number}. Void the invoice first.`)
      const r = await tx.salesOrder.updateMany({ where: { id: o.id, businessId: c.businessId, status: from }, data: { status: 'CANCELLED', cancelledAt: now, stockApplied: false } })
      if (r.count === 0) throw conflict('The order changed while you were working on it. Reload and try again.')
      if (o.stockApplied) {
        const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: o.id }, orderBy: { productId: 'asc' } })
        for (const i of items) await applyStockChange(tx, c, i.productId, i.quantity, 'SALE_CANCELLED', o.number)
      }
    } else {
      const r = await tx.salesOrder.updateMany({ where: { id: o.id, businessId: c.businessId, status: from }, data: { status: to, ...(to === 'COMPLETED' ? { completedAt: now } : {}) } })
      if (r.count === 0) throw conflict('The order changed while you were working on it. Reload and try again.')
    }
    const verb = { CANCELLED: `Cancelled ${o.number}${o.stockApplied ? '; stock returned' : ''}`, PROCESSING: `Started processing ${o.number}`, COMPLETED: `Completed ${o.number}`, CONFIRMED: '', DRAFT: '' }[to]
    await audit(tx, c, { action: `salesOrder.${to.toLowerCase()}`, entity: 'SalesOrder', entityId: o.id, summary: verb })
  })
  return getOr404(c, o.id)
}

router.post('/:id/process', requirePermission('salesOrders:write'), validate({ params: idParam }), async (req, res) => ok(res, await transition(ctx(req), req.params.id as string, 'PROCESSING')))
router.post('/:id/complete', requirePermission('salesOrders:write'), validate({ params: idParam }), async (req, res) => ok(res, await transition(ctx(req), req.params.id as string, 'COMPLETED')))
router.post('/:id/cancel', requirePermission('salesOrders:write'), idempotent, validate({ params: idParam }), async (req, res) => ok(res, await transition(ctx(req), req.params.id as string, 'CANCELLED')))
