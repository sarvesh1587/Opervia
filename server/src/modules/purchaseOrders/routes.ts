import { Router } from 'express'
import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import type { AuthContext } from '../../auth/permissions.js'
import { audit } from '../../lib/audit.js'
import { nextNumber } from '../../lib/counter.js'
import { conflict, notFound, unprocessable } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { computeTotals } from '../../lib/money.js'
import { money, optionalText, pageQuery, qty, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idempotent } from '../../middleware/idempotency.js'
import { idParam, validate } from '../../middleware/validate.js'
import { applyStockChange } from '../products/service.js'

export const router = Router()

/** DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED; DRAFT or ORDERED (nothing received) → CANCELLED. */
const TRANSITIONS = { DRAFT: ['ORDERED', 'CANCELLED'], ORDERED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'], PARTIALLY_RECEIVED: ['RECEIVED'], RECEIVED: [], CANCELLED: [] } as const

const include = {
  supplier: { select: { id: true, name: true, email: true, phone: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true, stockQty: true } } }, orderBy: { id: 'asc' } },
  createdBy: { select: { name: true } },
} satisfies Prisma.PurchaseOrderInclude

async function getOr404(businessId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, businessId }, include })
  if (!po) throw notFound('Purchase order')
  return { ...po, allowedTransitions: TRANSITIONS[po.status] }
}

const itemsSchema = z.array(z.object({ productId: z.string().min(1).max(40), quantity: qty, unitCost: money })).min(1, 'Add at least one line').max(100)
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, 'Each product can appear only once')
const draftBody = z.object({ supplierId: z.string().min(1).max(40), items: itemsSchema, expectedAt: z.coerce.date().optional().nullable(), notes: optionalText(500) })

async function buildLines(c: AuthContext, items: z.infer<typeof itemsSchema>) {
  const products = await prisma.product.findMany({ where: { businessId: c.businessId, id: { in: items.map((i) => i.productId) } } })
  if (products.length !== items.length) throw unprocessable('One or more products do not exist.')
  if (products.some((p) => p.status === 'ARCHIVED')) throw unprocessable('Archived products cannot be ordered.')
  const business = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId } })
  const t = computeTotals(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost })), 0, business.taxRate)
  return { lines: items.map((i, idx) => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost, lineTotal: t.lineTotals[idx] })), totals: { subtotal: t.subtotal, taxAmount: t.taxAmount, total: t.total } }
}

const listQuery = z.object({ ...pageQuery, status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'OPEN', 'ALL']).default('ALL'), supplierId: z.string().max(40).optional() })

router.get('/', requirePermission('purchaseOrders:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const where: Prisma.PurchaseOrderWhereInput = {
    businessId: c.businessId,
    ...(q.status === 'OPEN' ? { status: { in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] } } : q.status !== 'ALL' ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { supplier: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  }
  const [items, total, counts] = await Promise.all([
    prisma.purchaseOrder.findMany({ where, orderBy: [{ createdAt: 'desc' }], ...skipTake(q.page, q.pageSize), include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } }, items: { select: { quantity: true, receivedQty: true } } } }),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.groupBy({ by: ['status'], where: { businessId: c.businessId }, _count: true }),
  ])
  ok(res, {
    ...page(items.map(({ items: lines, _count, ...po }) => ({ ...po, lineCount: _count.items, orderedUnits: lines.reduce((s, l) => s + l.quantity, 0), receivedUnits: lines.reduce((s, l) => s + l.receivedQty, 0) })), total, q.page, q.pageSize),
    counts: Object.fromEntries(counts.map((x) => [x.status, x._count])),
  })
})

router.get('/:id', requirePermission('purchaseOrders:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const po = await getOr404(c.businessId, req.params.id as string)
  const movements = await prisma.inventoryMovement.findMany({ where: { businessId: c.businessId, reference: po.number }, orderBy: { createdAt: 'asc' }, include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } } } })
  ok(res, { ...po, receipts: movements })
})

router.post('/', requirePermission('purchaseOrders:write'), validate({ body: draftBody }), async (req, res) => {
  const c = ctx(req)
  const supplier = await prisma.supplier.findFirst({ where: { id: req.body.supplierId, businessId: c.businessId } })
  if (!supplier) throw unprocessable('Supplier does not exist.')
  if (supplier.status === 'INACTIVE') throw unprocessable('This supplier is inactive.')
  const { lines, totals } = await buildLines(c, req.body.items)
  const po = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, c.businessId, 'PO')
    const r = await tx.purchaseOrder.create({ data: { businessId: c.businessId, number, supplierId: supplier.id, expectedAt: req.body.expectedAt ?? null, notes: req.body.notes, createdById: c.userId, ...totals, items: { create: lines } } })
    await audit(tx, c, { action: 'purchaseOrder.created', entity: 'PurchaseOrder', entityId: r.id, summary: `Drafted ${number} for ${supplier.name}` })
    return r
  })
  ok(res, await getOr404(c.businessId, po.id), 201)
})

router.put('/:id', requirePermission('purchaseOrders:write'), validate({ params: idParam, body: draftBody }), async (req, res) => {
  const c = ctx(req)
  const po = await getOr404(c.businessId, req.params.id as string)
  if (po.status !== 'DRAFT') throw conflict('Only draft purchase orders can be edited.')
  const supplier = await prisma.supplier.findFirst({ where: { id: req.body.supplierId, businessId: c.businessId } })
  if (!supplier) throw unprocessable('Supplier does not exist.')
  const { lines, totals } = await buildLines(c, req.body.items)
  await prisma.$transaction(async (tx) => {
    const r = await tx.purchaseOrder.updateMany({ where: { id: po.id, businessId: c.businessId, status: 'DRAFT' }, data: { supplierId: supplier.id, expectedAt: req.body.expectedAt ?? null, notes: req.body.notes, ...totals } })
    if (r.count === 0) throw conflict('This purchase order was submitted by someone else.')
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } })
    await tx.purchaseOrderItem.createMany({ data: lines.map((l) => ({ ...l, purchaseOrderId: po.id })) })
    await audit(tx, c, { action: 'purchaseOrder.updated', entity: 'PurchaseOrder', entityId: po.id, summary: `Edited draft ${po.number}` })
  })
  ok(res, await getOr404(c.businessId, po.id))
})

router.post('/:id/submit', requirePermission('purchaseOrders:write'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const po = await getOr404(c.businessId, req.params.id as string)
  await prisma.$transaction(async (tx) => {
    const r = await tx.purchaseOrder.updateMany({ where: { id: po.id, businessId: c.businessId, status: 'DRAFT' }, data: { status: 'ORDERED', orderedAt: new Date() } })
    if (r.count === 0) throw conflict(`Purchase order is ${po.status.toLowerCase().replace('_', ' ')}; only drafts can be submitted.`)
    await audit(tx, c, { action: 'purchaseOrder.submitted', entity: 'PurchaseOrder', entityId: po.id, summary: `Sent ${po.number} to ${po.supplier.name}` })
  })
  ok(res, await getOr404(c.businessId, po.id))
})

const receiveBody = z.object({ items: z.array(z.object({ itemId: z.string().min(1).max(40), quantity: qty })).min(1).max(100), note: optionalText(200) })

/**
 * Receives goods. Each line's received quantity is raised with a guarded update, so the total received can
 * never exceed the quantity ordered, even when two people receive the same order at once.
 */
router.post('/:id/receive', requirePermission('purchaseOrders:receive'), idempotent, validate({ params: idParam, body: receiveBody }), async (req, res) => {
  const c = ctx(req)
  const po = await getOr404(c.businessId, req.params.id as string)
  if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw conflict(`Goods can only be received against an ordered purchase order (this one is ${po.status.toLowerCase().replace('_', ' ')}).`)
  const byId = new Map(po.items.map((i) => [i.id, i]))
  for (const r of req.body.items) if (!byId.has(r.itemId)) throw unprocessable('A line does not belong to this purchase order.')
  if (new Set(req.body.items.map((i: { itemId: string }) => i.itemId)).size !== req.body.items.length) throw unprocessable('Each line can appear only once.')

  await prisma.$transaction(async (tx) => {
    for (const r of req.body.items as { itemId: string; quantity: number }[]) {
      const line = byId.get(r.itemId)!
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "PurchaseOrderItem" SET "receivedQty" = "receivedQty" + ${r.quantity}
        WHERE "id" = ${r.itemId} AND "purchaseOrderId" = ${po.id} AND "receivedQty" + ${r.quantity} <= "quantity"`)
      if (updated === 0) {
        const fresh = await tx.purchaseOrderItem.findUniqueOrThrow({ where: { id: r.itemId } })
        throw conflict(`Only ${fresh.quantity - fresh.receivedQty} of ${line.product.name} remain to be received.`, { itemId: r.itemId, remaining: fresh.quantity - fresh.receivedQty })
      }
      await applyStockChange(tx, c, line.productId, r.quantity, 'PURCHASE_RECEIPT', po.number, req.body.note)
    }
    const lines = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } })
    const complete = lines.every((l) => l.receivedQty === l.quantity)
    const r = await tx.purchaseOrder.updateMany({ where: { id: po.id, status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] } }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', ...(complete ? { receivedAt: new Date() } : {}) } })
    if (r.count === 0) throw conflict('This purchase order changed while receiving. Reload and try again.')
    const units = (req.body.items as { quantity: number }[]).reduce((s, i) => s + i.quantity, 0)
    await audit(tx, c, { action: 'purchaseOrder.received', entity: 'PurchaseOrder', entityId: po.id, summary: `Received ${units} units against ${po.number}${complete ? ' — order complete' : ''}` })
  })
  ok(res, await getOr404(c.businessId, po.id))
})

router.post('/:id/cancel', requirePermission('purchaseOrders:write'), validate({ params: idParam, body: z.object({ reason: optionalText(200) }) }), async (req, res) => {
  const c = ctx(req)
  const po = await getOr404(c.businessId, req.params.id as string)
  if (po.items.some((i) => i.receivedQty > 0)) throw conflict('Goods have already been received against this order, so it cannot be cancelled.')
  await prisma.$transaction(async (tx) => {
    const r = await tx.purchaseOrder.updateMany({ where: { id: po.id, businessId: c.businessId, status: { in: ['DRAFT', 'ORDERED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    if (r.count === 0) throw conflict(`A ${po.status.toLowerCase().replace('_', ' ')} purchase order cannot be cancelled.`)
    await audit(tx, c, { action: 'purchaseOrder.cancelled', entity: 'PurchaseOrder', entityId: po.id, summary: `Cancelled ${po.number}${req.body.reason ? `: ${req.body.reason}` : ''}` })
  })
  ok(res, await getOr404(c.businessId, po.id))
})
