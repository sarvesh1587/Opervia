import { prisma, Prisma, type Tx } from '../../db.js'
import type { AuthContext } from '../../auth/permissions.js'
import { audit } from '../../lib/audit.js'
import { conflict, notFound, unprocessable } from '../../lib/errors.js'

export type StockState = 'ok' | 'low' | 'out'
export const stockState = (p: { stockQty: number; reorderLevel: number }): StockState => (p.stockQty === 0 ? 'out' : p.stockQty <= p.reorderLevel ? 'low' : 'ok')

/** Units sold per product over the last `days`, from confirmed, processing and completed orders. */
export async function unitsSold(businessId: string, productIds: string[], days = 30) {
  if (productIds.length === 0) return new Map<string, number>()
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await prisma.$queryRaw<{ productId: string; qty: bigint }[]>(Prisma.sql`
    SELECT i."productId", SUM(i."quantity")::bigint AS qty
    FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId"
    WHERE o."businessId" = ${businessId} AND o."status" IN ('CONFIRMED','PROCESSING','COMPLETED')
      AND o."confirmedAt" >= ${since} AND i."productId" IN (${Prisma.join(productIds)})
    GROUP BY i."productId"`)
  return new Map(rows.map((r) => [r.productId, Number(r.qty)]))
}

export function withStock<T extends { id: string; stockQty: number; reorderLevel: number }>(p: T, sold30: number) {
  const dailySales = sold30 / 30
  return { ...p, state: stockState(p), dailySales: Math.round(dailySales * 100) / 100, coverDays: dailySales > 0 ? Math.floor(p.stockQty / dailySales) : null }
}

export async function getProductOr404(businessId: string, id: string) {
  const p = await prisma.product.findFirst({ where: { id, businessId }, include: { category: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } } })
  if (!p) throw notFound('Product')
  return p
}

/** Applies a signed stock change atomically. A decrease fails instead of driving stock below zero. */
export async function applyStockChange(tx: Tx, c: Pick<AuthContext, 'businessId' | 'userId'>, productId: string, delta: number, type: 'OPENING' | 'PURCHASE_RECEIPT' | 'SALE' | 'SALE_CANCELLED' | 'ADJUSTMENT', reference: string | null, note: string | null = null) {
  if (delta === 0) return
  const where = delta < 0 ? { id: productId, businessId: c.businessId, stockQty: { gte: -delta } } : { id: productId, businessId: c.businessId }
  const r = await tx.product.updateMany({ where, data: { stockQty: { increment: delta } } })
  if (r.count === 0) {
    const p = await tx.product.findFirst({ where: { id: productId, businessId: c.businessId }, select: { name: true, stockQty: true } })
    if (!p) throw notFound('Product')
    throw conflict(`Not enough stock for ${p.name}: ${p.stockQty} available, ${-delta} needed.`, { productId, available: p.stockQty, requested: -delta })
  }
  const after = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQty: true, name: true } })
  await tx.inventoryMovement.create({ data: { businessId: c.businessId, productId, type, quantity: delta, balanceAfter: after.stockQty, reference, note, userId: c.userId } })
  if (delta < 0 && after.stockQty === 0) {
    await tx.auditLog.create({ data: { businessId: c.businessId, userId: null, action: 'stock.depleted', entity: 'Product', entityId: productId, summary: `${after.name} reached zero stock` } })
  }
}

export async function adjustStock(c: AuthContext, id: string, quantity: number, note: string) {
  if (quantity === 0) throw unprocessable('Adjustment must change the quantity.')
  return prisma.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id, businessId: c.businessId } })
    if (!p) throw notFound('Product')
    if (p.status === 'ARCHIVED') throw conflict('Restore the product before adjusting its stock.')
    await applyStockChange(tx, c, id, quantity, 'ADJUSTMENT', 'Manual adjustment', note)
    await audit(tx, c, { action: 'stock.adjusted', entity: 'Product', entityId: id, summary: `Adjusted ${p.name} by ${quantity > 0 ? '+' : ''}${quantity}: ${note}` })
    return tx.product.findUniqueOrThrow({ where: { id } })
  })
}
