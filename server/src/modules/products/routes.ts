import { Router } from 'express'
import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import { audit } from '../../lib/audit.js'
import { conflict, unprocessable } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { money, optionalText, pageQuery, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idempotent } from '../../middleware/idempotency.js'
import { idParam, validate } from '../../middleware/validate.js'
import { adjustStock, applyStockChange, getProductOr404, unitsSold, withStock } from './service.js'

export const router = Router()

const listQuery = z.object({
  ...pageQuery,
  category: z.string().max(40).optional(),
  supplierId: z.string().max(40).optional(),
  stock: z.enum(['all', 'ok', 'low', 'out', 'attention']).default('all'),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  sort: z.enum(['name', 'sku', 'stockQty', 'sellingPrice', 'costPrice', 'updatedAt']).default('name'),
})

router.get('/', requirePermission('products:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const reorder = prisma.product.fields.reorderLevel
  const stockWhere: Prisma.ProductWhereInput =
    q.stock === 'out' ? { stockQty: 0 }
      : q.stock === 'low' ? { stockQty: { gt: 0, lte: reorder } }
        : q.stock === 'ok' ? { stockQty: { gt: reorder } }
          : q.stock === 'attention' ? { stockQty: { lte: reorder } } : {}
  const where: Prisma.ProductWhereInput = {
    businessId: c.businessId,
    ...(q.status !== 'ALL' ? { status: q.status } : {}),
    ...(q.category ? { categoryId: q.category } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }] } : {}),
    ...stockWhere,
  }
  const [items, total, counts] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ [q.sort]: q.order }, { id: 'asc' }], ...skipTake(q.page, q.pageSize), include: { category: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } } }),
    prisma.product.count({ where }),
    prisma.$queryRaw<{ ok: bigint; low: bigint; out: bigint; value: Prisma.Decimal | null }[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE "stockQty" > "reorderLevel") AS ok,
             COUNT(*) FILTER (WHERE "stockQty" > 0 AND "stockQty" <= "reorderLevel") AS low,
             COUNT(*) FILTER (WHERE "stockQty" = 0) AS out,
             SUM("stockQty" * "costPrice") AS value
      FROM "Product" WHERE "businessId" = ${c.businessId} AND "status" = 'ACTIVE'`),
  ])
  const sold = await unitsSold(c.businessId, items.map((p) => p.id))
  const summary = { ok: Number(counts[0].ok), low: Number(counts[0].low), out: Number(counts[0].out), valueAtCost: Number(counts[0].value ?? 0) }
  ok(res, { ...page(items.map((p) => withStock(p, sold.get(p.id) ?? 0)), total, q.page, q.pageSize), summary })
})

router.get('/categories', requirePermission('products:read'), async (req, res) => {
  const c = ctx(req)
  const cats = await prisma.category.findMany({ where: { businessId: c.businessId }, orderBy: { name: 'asc' }, include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } } })
  ok(res, cats.map((x) => ({ id: x.id, name: x.name, productCount: x._count.products })))
})

router.post('/categories', requirePermission('products:write'), validate({ body: z.object({ name: z.string().trim().min(2).max(60) }) }), async (req, res) => {
  const c = ctx(req)
  ok(res, await prisma.category.create({ data: { businessId: c.businessId, name: req.body.name } }), 201)
})

router.get('/:id', requirePermission('products:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const p = await getProductOr404(c.businessId, req.params.id as string)
  const [sold, movements, openPO] = await Promise.all([
    unitsSold(c.businessId, [p.id]),
    prisma.inventoryMovement.findMany({ where: { businessId: c.businessId, productId: p.id }, orderBy: { createdAt: 'desc' }, take: 60, include: { user: { select: { name: true } } } }),
    prisma.purchaseOrderItem.aggregate({ where: { productId: p.id, purchaseOrder: { businessId: c.businessId, status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] } } }, _sum: { quantity: true, receivedQty: true } }),
  ])
  ok(res, { ...withStock(p, sold.get(p.id) ?? 0), sold30: sold.get(p.id) ?? 0, incoming: (openPO._sum.quantity ?? 0) - (openPO._sum.receivedQty ?? 0), movements })
})

const productBody = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(32).regex(/^[A-Z0-9-_.]+$/, 'Use letters, numbers, dashes or dots'),
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000),
  categoryId: z.string().max(40).nullable().optional(),
  supplierId: z.string().max(40).nullable().optional(),
  costPrice: money,
  sellingPrice: money,
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
})

async function assertRefs(businessId: string, b: { categoryId?: string | null; supplierId?: string | null }) {
  if (b.categoryId && !(await prisma.category.findFirst({ where: { id: b.categoryId, businessId } }))) throw unprocessable('Category does not exist.')
  if (b.supplierId && !(await prisma.supplier.findFirst({ where: { id: b.supplierId, businessId } }))) throw unprocessable('Supplier does not exist.')
}

router.post('/', requirePermission('products:write'), validate({ body: productBody.extend({ openingStock: z.coerce.number().int().min(0).max(1_000_000).default(0) }) }), async (req, res) => {
  const c = ctx(req)
  const { openingStock, ...b } = req.body
  await assertRefs(c.businessId, b)
  if (b.sellingPrice < b.costPrice) throw unprocessable('Selling price is below cost price.')
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({ data: { ...b, businessId: c.businessId } })
    if (openingStock > 0) await applyStockChange(tx, c, p.id, openingStock, 'OPENING', 'Opening balance')
    await audit(tx, c, { action: 'product.created', entity: 'Product', entityId: p.id, summary: `Added ${p.name} (${p.sku})` })
    return tx.product.findUniqueOrThrow({ where: { id: p.id } })
  })
  ok(res, product, 201)
})

router.patch('/:id', requirePermission('products:write'), validate({ params: idParam, body: productBody.partial() }), async (req, res) => {
  const c = ctx(req)
  const current = await getProductOr404(c.businessId, req.params.id as string)
  await assertRefs(c.businessId, req.body)
  const cost = req.body.costPrice ?? Number(current.costPrice), price = req.body.sellingPrice ?? Number(current.sellingPrice)
  if (price < cost) throw unprocessable('Selling price is below cost price.')
  const p = await prisma.$transaction(async (tx) => {
    const u = await tx.product.update({ where: { id: current.id }, data: req.body })
    await audit(tx, c, { action: 'product.updated', entity: 'Product', entityId: u.id, summary: `Updated ${u.name}`, metadata: { fields: Object.keys(req.body) } })
    return u
  })
  ok(res, p)
})

router.post('/:id/adjust', requirePermission('products:adjust'), idempotent, validate({ params: idParam, body: z.object({ quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000), note: z.string().trim().min(3, 'Explain the adjustment').max(200) }) }), async (req, res) => {
  ok(res, await adjustStock(ctx(req), req.params.id as string, req.body.quantity, req.body.note))
})

for (const [path, status, verb] of [['archive', 'ARCHIVED', 'Archived'], ['restore', 'ACTIVE', 'Restored']] as const) {
  router.post(`/:id/${path}`, requirePermission('products:write'), validate({ params: idParam }), async (req, res) => {
    const c = ctx(req)
    const p = await getProductOr404(c.businessId, req.params.id as string)
    const u = await prisma.$transaction(async (tx) => {
      const r = await tx.product.update({ where: { id: p.id }, data: { status } })
      await audit(tx, c, { action: `product.${path}d`, entity: 'Product', entityId: p.id, summary: `${verb} ${p.name}` })
      return r
    })
    ok(res, u)
  })
}

/** Hard delete only when nothing historical depends on the product; otherwise archive. */
router.delete('/:id', requirePermission('products:write'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const p = await getProductOr404(c.businessId, req.params.id as string)
  const [so, po, inv, moves] = await Promise.all([
    prisma.salesOrderItem.count({ where: { productId: p.id } }),
    prisma.purchaseOrderItem.count({ where: { productId: p.id } }),
    prisma.invoiceItem.count({ where: { productId: p.id } }),
    prisma.inventoryMovement.count({ where: { productId: p.id, type: { not: 'OPENING' } } }),
  ])
  if (so + po + inv + moves > 0) throw conflict('This product has order or stock history. Archive it instead so the history stays intact.')
  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.deleteMany({ where: { productId: p.id } })
    await tx.product.delete({ where: { id: p.id } })
    await audit(tx, c, { action: 'product.deleted', entity: 'Product', entityId: p.id, summary: `Deleted ${p.name} (${p.sku})` })
  })
  ok(res, { deleted: true })
})
