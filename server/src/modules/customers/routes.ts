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

const listQuery = z.object({ ...pageQuery, status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ALL'), sort: z.enum(['name', 'totalPurchases', 'outstanding']).default('name') })

/** Purchases count confirmed, processing and completed orders; outstanding = invoice totals minus payments. */
async function customerStats(businessId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { totalPurchases: number; orderCount: number; outstanding: number; lastOrderAt: Date | null }>()
  const [orders, invoices] = await Promise.all([
    prisma.$queryRaw<{ customerId: string; total: Prisma.Decimal | null; n: bigint; last: Date | null }[]>(Prisma.sql`
      SELECT "customerId", SUM("total") AS total, COUNT(*) AS n, MAX("confirmedAt") AS last FROM "SalesOrder"
      WHERE "businessId" = ${businessId} AND "status" IN ('CONFIRMED','PROCESSING','COMPLETED') AND "customerId" IN (${Prisma.join(ids)})
      GROUP BY "customerId"`),
    prisma.$queryRaw<{ customerId: string; due: Prisma.Decimal | null }[]>(Prisma.sql`
      SELECT "customerId", SUM("total" - "amountPaid") AS due FROM "Invoice"
      WHERE "businessId" = ${businessId} AND "status" IN ('UNPAID','PARTIALLY_PAID') AND "customerId" IN (${Prisma.join(ids)})
      GROUP BY "customerId"`),
  ])
  const m = new Map<string, { totalPurchases: number; orderCount: number; outstanding: number; lastOrderAt: Date | null }>()
  ids.forEach((id) => m.set(id, { totalPurchases: 0, orderCount: 0, outstanding: 0, lastOrderAt: null }))
  orders.forEach((o) => Object.assign(m.get(o.customerId)!, { totalPurchases: Number(o.total ?? 0), orderCount: Number(o.n), lastOrderAt: o.last }))
  invoices.forEach((i) => (m.get(i.customerId)!.outstanding = Number(i.due ?? 0)))
  return m
}

router.get('/', requirePermission('customers:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const where: Prisma.CustomerWhereInput = { businessId: c.businessId, ...(q.status !== 'ALL' ? { status: q.status } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { contactName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}) }
  const total = await prisma.customer.count({ where })
  let ids: string[]
  if (q.sort === 'name') {
    ids = (await prisma.customer.findMany({ where, orderBy: [{ name: q.order }, { id: 'asc' }], ...skipTake(q.page, q.pageSize), select: { id: true } })).map((x) => x.id)
  } else {
    // Sorting by a derived figure is done in SQL so pagination stays correct.
    const col = q.sort === 'totalPurchases'
      ? Prisma.sql`(SELECT COALESCE(SUM(o."total"),0) FROM "SalesOrder" o WHERE o."customerId" = c."id" AND o."status" IN ('CONFIRMED','PROCESSING','COMPLETED'))`
      : Prisma.sql`(SELECT COALESCE(SUM(i."total" - i."amountPaid"),0) FROM "Invoice" i WHERE i."customerId" = c."id" AND i."status" IN ('UNPAID','PARTIALLY_PAID'))`
    const filter = q.q ? Prisma.sql`AND (c."name" ILIKE ${'%' + q.q + '%'} OR c."contactName" ILIKE ${'%' + q.q + '%'} OR c."email" ILIKE ${'%' + q.q + '%'})` : Prisma.empty
    const status = q.status !== 'ALL' ? Prisma.sql`AND c."status" = ${q.status}::"PartyStatus"` : Prisma.empty
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c."id" FROM "Customer" c WHERE c."businessId" = ${c.businessId} ${status} ${filter}
      ORDER BY ${col} ${q.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, c."id" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`)
    ids = rows.map((r) => r.id)
  }
  const [records, stats] = await Promise.all([prisma.customer.findMany({ where: { id: { in: ids } } }), customerStats(c.businessId, ids)])
  const byId = new Map(records.map((r) => [r.id, r]))
  ok(res, page(ids.map((id) => ({ ...byId.get(id)!, ...stats.get(id)! })), total, q.page, q.pageSize))
})

router.get('/:id', requirePermission('customers:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const cust = await prisma.customer.findFirst({
    where: { id: req.params.id as string, businessId: c.businessId },
    include: {
      salesOrders: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, number: true, status: true, total: true, createdAt: true, confirmedAt: true } },
      invoices: { orderBy: { issueDate: 'desc' }, take: 30, select: { id: true, number: true, status: true, total: true, amountPaid: true, issueDate: true, dueDate: true } },
    },
  })
  if (!cust) throw notFound('Customer')
  const stats = (await customerStats(c.businessId, [cust.id])).get(cust.id)!
  ok(res, { ...cust, ...stats })
})

router.post('/', requirePermission('customers:write'), validate({ body }), async (req, res) => {
  const c = ctx(req)
  const r = await prisma.$transaction(async (tx) => {
    const x = await tx.customer.create({ data: { ...req.body, businessId: c.businessId } })
    await audit(tx, c, { action: 'customer.created', entity: 'Customer', entityId: x.id, summary: `Added customer ${x.name}` })
    return x
  })
  ok(res, r, 201)
})

router.patch('/:id', requirePermission('customers:write'), validate({ params: idParam, body: body.partial() }), async (req, res) => {
  const c = ctx(req)
  const cur = await prisma.customer.findFirst({ where: { id: req.params.id as string, businessId: c.businessId } })
  if (!cur) throw notFound('Customer')
  const r = await prisma.$transaction(async (tx) => {
    const x = await tx.customer.update({ where: { id: cur.id }, data: req.body })
    await audit(tx, c, { action: 'customer.updated', entity: 'Customer', entityId: x.id, summary: `Updated customer ${x.name}` })
    return x
  })
  ok(res, r)
})

router.delete('/:id', requirePermission('customers:write'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const cur = await prisma.customer.findFirst({ where: { id: req.params.id as string, businessId: c.businessId }, include: { _count: { select: { salesOrders: true, invoices: true } } } })
  if (!cur) throw notFound('Customer')
  if (cur._count.salesOrders + cur._count.invoices > 0) throw conflict('This customer has orders or invoices. Mark them inactive instead.')
  await prisma.$transaction(async (tx) => {
    await tx.customer.delete({ where: { id: cur.id } })
    await audit(tx, c, { action: 'customer.deleted', entity: 'Customer', entityId: cur.id, summary: `Deleted customer ${cur.name}` })
  })
  ok(res, { deleted: true })
})
