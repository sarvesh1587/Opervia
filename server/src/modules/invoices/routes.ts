import { Router } from 'express'
import { z } from 'zod'
import { prisma, Prisma } from '../../db.js'
import { audit } from '../../lib/audit.js'
import { nextNumber } from '../../lib/counter.js'
import { conflict, notFound, unprocessable } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { D } from '../../lib/money.js'
import { money, optionalText, pageQuery, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idempotent } from '../../middleware/idempotency.js'
import { idParam, validate } from '../../middleware/validate.js'
import { renderInvoicePdf } from './pdf.js'

export const router = Router()

const include = {
  customer: true,
  salesOrder: { select: { id: true, number: true, status: true } },
  items: { orderBy: { id: 'asc' } },
  payments: { orderBy: { paidAt: 'asc' }, include: { user: { select: { name: true } } } },
} satisfies Prisma.InvoiceInclude

const shape = <T extends { total: Prisma.Decimal; amountPaid: Prisma.Decimal; dueDate: Date; status: string }>(i: T) => ({
  ...i,
  outstanding: Number(i.total.minus(i.amountPaid).toFixed(2)),
  overdue: ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && i.dueDate < new Date(),
  daysOverdue: ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) ? Math.max(0, Math.floor((Date.now() - i.dueDate.getTime()) / 86_400_000)) : 0,
})

async function getOr404(businessId: string, id: string) {
  const inv = await prisma.invoice.findFirst({ where: { id, businessId }, include })
  if (!inv) throw notFound('Invoice')
  return shape(inv)
}

const listQuery = z.object({
  ...pageQuery,
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OPEN', 'OVERDUE', 'ALL']).default('ALL'),
  customerId: z.string().max(40).optional(),
  sort: z.enum(['issueDate', 'dueDate', 'total', 'number']).default('issueDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

router.get('/', requirePermission('invoices:read'), validate({ query: listQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof listQuery>
  const open: Prisma.InvoiceWhereInput = { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }
  const where: Prisma.InvoiceWhereInput = {
    businessId: c.businessId,
    ...(q.status === 'OPEN' ? open : q.status === 'OVERDUE' ? { ...open, dueDate: { lt: new Date() } } : q.status !== 'ALL' ? { status: q.status } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  }
  const [items, total, summary] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ [q.sort]: q.order }, { id: 'desc' }], ...skipTake(q.page, q.pageSize), include: { customer: { select: { id: true, name: true } }, salesOrder: { select: { id: true, number: true } } } }),
    prisma.invoice.count({ where }),
    prisma.$queryRaw<{ outstanding: Prisma.Decimal | null; overdue: Prisma.Decimal | null; overdueCount: bigint; openCount: bigint; collected30: Prisma.Decimal | null }[]>(Prisma.sql`
      SELECT SUM("total" - "amountPaid") FILTER (WHERE "status" IN ('UNPAID','PARTIALLY_PAID')) AS outstanding,
             SUM("total" - "amountPaid") FILTER (WHERE "status" IN ('UNPAID','PARTIALLY_PAID') AND "dueDate" < NOW()) AS overdue,
             COUNT(*) FILTER (WHERE "status" IN ('UNPAID','PARTIALLY_PAID') AND "dueDate" < NOW()) AS "overdueCount",
             COUNT(*) FILTER (WHERE "status" IN ('UNPAID','PARTIALLY_PAID')) AS "openCount",
             (SELECT SUM(p."amount") FROM "Payment" p WHERE p."businessId" = ${c.businessId} AND p."paidAt" >= NOW() - INTERVAL '30 days') AS collected30
      FROM "Invoice" WHERE "businessId" = ${c.businessId}`),
  ])
  const s = summary[0]
  ok(res, { ...page(items.map(shape), total, q.page, q.pageSize), summary: { outstanding: Number(s.outstanding ?? 0), overdue: Number(s.overdue ?? 0), overdueCount: Number(s.overdueCount), openCount: Number(s.openCount), collected30: Number(s.collected30 ?? 0) } })
})

router.get('/:id', requirePermission('invoices:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const [inv, business] = await Promise.all([getOr404(c.businessId, req.params.id as string), prisma.business.findUniqueOrThrow({ where: { id: c.businessId }, select: { name: true, city: true, taxLabel: true, currency: true } })])
  ok(res, { ...inv, business })
})

/** Creates an invoice from an order's own lines. Prices are copied, so later product price changes never alter it. */
router.post('/', requirePermission('invoices:write'), validate({ body: z.object({ salesOrderId: z.string().min(1).max(40) }) }), async (req, res) => {
  const c = ctx(req)
  const order = await prisma.salesOrder.findFirst({ where: { id: req.body.salesOrderId, businessId: c.businessId }, include: { items: { include: { product: { select: { name: true, sku: true } } } }, invoice: true, customer: true } })
  if (!order) throw unprocessable('Sales order does not exist.')
  if (order.invoice) throw conflict(`Order ${order.number} already has invoice ${order.invoice.number}.`)
  if (!['CONFIRMED', 'PROCESSING', 'COMPLETED'].includes(order.status)) throw conflict(`Only confirmed, processing or completed orders can be invoiced (this one is ${order.status.toLowerCase()}).`)
  const business = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId } })
  const id = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, c.businessId, 'INV')
    const issue = new Date()
    const inv = await tx.invoice.create({
      data: {
        businessId: c.businessId, number, salesOrderId: order.id, customerId: order.customerId, issueDate: issue,
        dueDate: new Date(issue.getTime() + business.paymentTermsDays * 86_400_000),
        subtotal: order.subtotal, discount: order.discount, taxRate: order.taxRate, taxAmount: order.taxAmount, total: order.total,
        items: { create: order.items.map((i) => ({ productId: i.productId, description: i.product.name, sku: i.product.sku, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })) },
      },
    })
    await audit(tx, c, { action: 'invoice.issued', entity: 'Invoice', entityId: inv.id, summary: `Issued ${number} to ${order.customer.name}` })
    return inv.id
  })
  ok(res, await getOr404(c.businessId, id), 201)
})

const paymentBody = z.object({
  amount: money.refine((n) => n > 0, 'Amount must be greater than zero'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE']),
  reference: optionalText(80),
  paidAt: z.coerce.date().max(new Date(Date.now() + 86_400_000), 'Payment date cannot be in the future').optional(),
})

/**
 * Records a payment. The invoice row is locked for the transaction, so two payments arriving together cannot
 * both pass the balance check. Payments here are demo records; no money moves.
 */
router.post('/:id/payments', requirePermission('payments:write'), idempotent, validate({ params: idParam, body: paymentBody }), async (req, res) => {
  const c = ctx(req)
  const inv = await getOr404(c.businessId, req.params.id as string)
  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ total: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string }[]>(Prisma.sql`SELECT "total", "amountPaid", "status" FROM "Invoice" WHERE "id" = ${inv.id} AND "businessId" = ${c.businessId} FOR UPDATE`)
    if (!['UNPAID', 'PARTIALLY_PAID'].includes(locked.status)) throw conflict(`Invoice ${inv.number} is ${locked.status.toLowerCase().replace('_', ' ')}; it cannot take payments.`)
    const outstanding = D(locked.total).minus(locked.amountPaid)
    const amount = D(req.body.amount)
    if (amount.greaterThan(outstanding)) throw unprocessable(`Payment exceeds the outstanding balance of ₹${outstanding.toFixed(2)}.`, { outstanding: Number(outstanding.toFixed(2)) })
    const paid = D(locked.amountPaid).plus(amount)
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: paid.equals(locked.total) ? 'PAID' : 'PARTIALLY_PAID' } })
    await tx.payment.create({ data: { businessId: c.businessId, invoiceId: inv.id, amount, method: req.body.method, reference: req.body.reference, paidAt: req.body.paidAt ?? new Date(), userId: c.userId, isDemo: true } })
    await audit(tx, c, { action: 'payment.recorded', entity: 'Invoice', entityId: inv.id, summary: `${inv.number} ${paid.equals(locked.total) ? 'paid in full' : 'part-paid'} ₹${amount.toFixed(0)} by ${inv.customer.name}` })
  })
  ok(res, await getOr404(c.businessId, inv.id), 201)
})

router.post('/:id/void', requirePermission('invoices:write'), validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(200) }) }), async (req, res) => {
  const c = ctx(req)
  const inv = await getOr404(c.businessId, req.params.id as string)
  if (inv.payments.length > 0) throw conflict('Invoices with recorded payments cannot be voided.')
  await prisma.$transaction(async (tx) => {
    const r = await tx.invoice.updateMany({ where: { id: inv.id, status: 'UNPAID', amountPaid: 0 }, data: { status: 'VOID' } })
    if (r.count === 0) throw conflict('Only unpaid invoices can be voided.')
    await audit(tx, c, { action: 'invoice.voided', entity: 'Invoice', entityId: inv.id, summary: `Voided ${inv.number}: ${req.body.reason}` })
  })
  ok(res, await getOr404(c.businessId, inv.id))
})

router.get('/:id/pdf', requirePermission('invoices:read'), validate({ params: idParam }), async (req, res) => {
  const c = ctx(req)
  const inv = await getOr404(c.businessId, req.params.id as string)
  const business = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId } })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${inv.number}.pdf"`)
  renderInvoicePdf(inv, business, res)
})
