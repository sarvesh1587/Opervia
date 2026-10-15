import { Prisma } from '../db.js'

type DecVal = Prisma.Decimal | number | string

export const D = (v: DecVal) => new Prisma.Decimal(v)
export const ZERO = D(0)
export const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
export const sumD = (values: Prisma.Decimal[]) => values.reduce((s, v) => s.plus(v), ZERO)

/** Order and invoice totals: tax is charged on the subtotal after discount. */
export function computeTotals(lines: { quantity: number; unitPrice: DecVal }[], discount: DecVal, taxRate: DecVal) {
  const lineTotals = lines.map((l) => round2(D(l.unitPrice).times(l.quantity)))
  const subtotal = sumD(lineTotals)
  const disc = round2(D(discount))
  const taxable = subtotal.minus(disc)
  const taxAmount = round2(taxable.times(D(taxRate)).dividedBy(100))
  return { lineTotals, subtotal, discount: disc, taxAmount, total: taxable.plus(taxAmount) }
}
