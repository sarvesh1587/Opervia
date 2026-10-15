import { Router } from 'express'
import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import { audit } from '../../lib/audit.js'
import { conflict, notFound } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { gstin, optionalEmail, optionalText, pageQuery, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idParam, validate } from '../../middleware/validate.js'

export const router = Router()

const body = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: optionalText(80),
  email: optionalEmail,
  phone: z.string().trim().max(20).optional().transform((v) => (v ? v : null)).pipe(z.string().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').nullable()),
  address: optionalText(300),
  gstin,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

const listQuery = z.object({ ...pageQuery, status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ALL') })

router.get('/', requirePermission('suppliers:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const where: Prisma.SupplierWhereInput = { businessId: c.businessId, ...(q.status !== 'ALL' ? { status: q.status } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { contactName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}) }
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: [{ name: q.order }], ...skipTake(q.page, q.pageSize), include: { _count: { select: { products: { where: { status: 'ACTIVE' } }, purchaseOrders: true } } } }),
    prisma.supplier.count({ where }),
  ])
  const ids = items.map((s) => s.id)
  const stats = ids.length ? await prisma.$queryRaw<{ supplierId: string; open: Prisma.Decimal | null; received: Prisma.Decimal | null; last: Date | null }[]>(Prisma.sql`
    SELECT po."supplierId",
      SUM(po."total") FILTER (WHERE po."status" IN ('ORDERED','PARTIALLY_RECEIVED')) AS open,
      SUM(po."total") FILTER (WHERE po."status" IN ('RECEIVED','PARTIALLY_RECEIVED')) AS received,
      MAX(po."orderedAt") AS last
    FROM "PurchaseOrder" po WHERE po."businessId" = ${c.businessId} AND po."supplierId" IN (${Prisma.join(ids)}) GROUP BY po."supplierId"`) : []
  const by = new Map(stats.map((s) => [s.supplierId, s]))
  ok(res, page(items.map(({ _count, ...s }) => ({ ...s, productCount: _count.products, purchaseOrderCount: _count.purchaseOrders, openOrderValue: Number(by.get(s.id)?.open ?? 0), receivedValue: Number(by.get(s.id)?.received ?? 0), lastOrderedAt: by.get(s.id)?.last ?? null })), total, q.page, q.pageSize))
})

router.get('/:id', requirePermission('suppliers:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const s = await prisma.supplier.findFirst({
    where: { id: req.params.id as string, businessId: c.businessId },
    include: {
      products: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, sku: true, name: true, stockQty: true, reorderLevel: true, costPrice: true } },
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, number: true, status: true, total: true, orderedAt: true, expectedAt: true, receivedAt: true, createdAt: true } },
    },
  })
  if (!s) throw notFound('Supplier')
  const totals = await prisma.purchaseOrder.groupBy({ by: ['status'], where: { businessId: c.businessId, supplierId: s.id }, _sum: { total: true }, _count: true })
  ok(res, { ...s, totals: totals.map((t) => ({ status: t.status, count: t._count, value: Number(t._sum.total ?? 0) })) })
})

router.post('/', requirePermission('suppliers:write'), validate({ body }), async (req, res) => {
  const c = ctx(req)
  const s = await prisma.$transaction(async (tx) => {
    const r = await tx.supplier.create({ data: { ...req.body, businessId: c.businessId } })
    await audit(tx, c, { action: 'supplier.created', entity: 'Supplier', entityId: r.id, summary: `Added supplier ${r.name}` })
    return r
  })
  ok(res, s, 201)
})

router.patch('/:id', requirePermission('suppliers:write'), validate({ params: idParam, body: body.partial() }), async (req, res) => {
  const c = ctx(req)
  const s = await prisma.supplier.findFirst({ where: { id: req.params.id as string, businessId: c.businessId } })
  if (!s) throw notFound('Supplier')
  const u = await prisma.$transaction(async (tx) => {
    const r = await tx.supplier.update({ where: { id: s.id }, data: req.body })
    await audit(tx, c, { action: 'supplier.updated', entity: 'Supplier', entityId: s.id, summary: `Updated supplier ${r.name}` })
    return r
  })
  ok(res, u)
})

router.delete('/:id', requirePermission('suppliers:write'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const s = await prisma.supplier.findFirst({ where: { id: req.params.id as string, businessId: c.businessId }, include: { _count: { select: { purchaseOrders: true, products: true } } } })
  if (!s) throw notFound('Supplier')
  if (s._count.purchaseOrders > 0 || s._count.products > 0) throw conflict('This supplier has products or purchase orders. Mark it inactive instead.')
  await prisma.$transaction(async (tx) => {
    await tx.supplier.delete({ where: { id: s.id } })
    await audit(tx, c, { action: 'supplier.deleted', entity: 'Supplier', entityId: s.id, summary: `Deleted supplier ${s.name}` })
  })
  ok(res, { deleted: true })
})
