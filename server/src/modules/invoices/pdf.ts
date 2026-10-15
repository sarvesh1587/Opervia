import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import type { Writable } from 'node:stream'
import type { Prisma } from '../../db.js'

const require = createRequire(import.meta.url)
const FONT = {
  regular: require.resolve('@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff'),
  semibold: require.resolve('@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff'),
  mono: require.resolve('@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff'),
}
const INK = '#0B0C0E', STONE = '#77736A', RULE = '#D6CFC1', LIME = '#CDF545'

type Dec = Prisma.Decimal
interface InvoiceForPdf {
  number: string; status: string; issueDate: Date; dueDate: Date
  subtotal: Dec; discount: Dec; taxRate: Dec; taxAmount: Dec; total: Dec; amountPaid: Dec
  customer: { name: string; address: string | null; email: string | null; phone: string | null; gstin: string | null }
  salesOrder: { number: string }
  items: { description: string; sku: string; quantity: number; unitPrice: Dec; lineTotal: Dec }[]
  payments: { amount: Dec; method: string; paidAt: Date; reference: string | null }[]
}

const inr = (v: Dec | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export function renderInvoicePdf(inv: InvoiceForPdf, business: { name: string; city: string | null; taxLabel: string }, out: Writable) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${inv.number} — ${business.name}`, Author: business.name } })
  doc.registerFont('r', FONT.regular).registerFont('b', FONT.semibold).registerFont('m', FONT.mono)
  doc.pipe(out)
  const L = 48, R = doc.page.width - 48, W = R - L

  // Mark + business
  doc.rect(L, 48, 11, 11).lineWidth(1.2).stroke(INK)
  doc.rect(L + 5, 53, 11, 11).fillAndStroke(LIME, INK)
  doc.font('b').fontSize(15).fillColor(INK).text(business.name, L + 26, 49)
  doc.font('r').fontSize(9).fillColor(STONE).text(business.city ?? '', L + 26, 68)
  doc.font('m').fontSize(8).fillColor(STONE).text('TAX INVOICE', L, 52, { width: W, align: 'right', characterSpacing: 1.2 })
  doc.font('b').fontSize(22).fillColor(INK).text(inv.number, L, 64, { width: W, align: 'right' })

  doc.moveTo(L, 104).lineTo(R, 104).lineWidth(1).stroke(INK)

  // Parties and dates
  const meta = (label: string, value: string, x: number, y: number, w = 150) => {
    doc.font('m').fontSize(7.5).fillColor(STONE).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.8 })
    doc.font('r').fontSize(10).fillColor(INK).text(value, x, y + 12, { width: w })
  }
  doc.font('m').fontSize(7.5).fillColor(STONE).text('BILLED TO', L, 120, { characterSpacing: 0.8 })
  doc.font('b').fontSize(12).fillColor(INK).text(inv.customer.name, L, 133, { width: 240 })
  doc.font('r').fontSize(9.5).fillColor(STONE).text([inv.customer.address, inv.customer.email, inv.customer.phone, inv.customer.gstin ? `GSTIN ${inv.customer.gstin}` : null].filter(Boolean).join('\n'), L, 151, { width: 240, lineGap: 2 })
  meta('Issued', date(inv.issueDate), L + 300, 120, 100)
  meta('Due', date(inv.dueDate), L + 410, 120, 90)
  meta('Order', inv.salesOrder.number, L + 300, 156, 100)
  meta('Status', inv.status.replace('_', ' ').toLowerCase(), L + 410, 156, 90)

  // Lines
  let y = 222
  const cols = { item: L, qty: L + 290, price: L + 340, total: R - 100 }
  doc.font('m').fontSize(7.5).fillColor(STONE)
  doc.text('ITEM', cols.item, y, { characterSpacing: 0.8 }).text('QTY', cols.qty, y, { width: 40, align: 'right' }).text('UNIT PRICE', cols.price, y, { width: 100, align: 'right' }).text('AMOUNT', cols.total, y, { width: 100, align: 'right' })
  y += 14
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1).stroke(INK)
  y += 8
  for (const it of inv.items) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 60 }
    doc.font('r').fontSize(10).fillColor(INK).text(it.description, cols.item, y, { width: 280 })
    doc.font('m').fontSize(7.5).fillColor(STONE).text(it.sku, cols.item, y + 13)
    doc.font('r').fontSize(10).fillColor(INK).text(String(it.quantity), cols.qty, y, { width: 40, align: 'right' }).text(inr(it.unitPrice), cols.price, y, { width: 100, align: 'right' }).text(inr(it.lineTotal), cols.total, y, { width: 100, align: 'right' })
    y += 30
    doc.moveTo(L, y - 6).lineTo(R, y - 6).lineWidth(0.5).stroke(RULE)
  }

  // Totals
  y += 6
  const row = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'b' : 'r').fontSize(bold ? 12 : 10).fillColor(bold ? INK : STONE).text(label, R - 250, y, { width: 140 })
    doc.fillColor(INK).text(value, R - 110, y, { width: 110, align: 'right' })
    y += bold ? 22 : 17
  }
  row('Subtotal', inr(inv.subtotal))
  if (Number(inv.discount) > 0) row('Discount', `−${inr(inv.discount)}`)
  row(`${business.taxLabel} ${Number(inv.taxRate)}%`, inr(inv.taxAmount))
  doc.moveTo(R - 250, y - 4).lineTo(R, y - 4).lineWidth(1).stroke(INK)
  y += 4
  row('Total', inr(inv.total), true)
  if (Number(inv.amountPaid) > 0) row('Paid', `−${inr(inv.amountPaid)}`)
  const due = Number(inv.total) - Number(inv.amountPaid)
  doc.rect(R - 250, y, 250, 30).fill(due > 0 ? LIME : '#EFEBE3')
  doc.font('b').fontSize(11).fillColor(INK).text('Balance due', R - 240, y + 9).text(inr(due), R - 110, y + 9, { width: 100, align: 'right' })
  y += 50

  if (inv.payments.length) {
    doc.font('m').fontSize(7.5).fillColor(STONE).text('PAYMENTS RECEIVED', L, y, { characterSpacing: 0.8 })
    y += 14
    for (const p of inv.payments) {
      doc.font('r').fontSize(9.5).fillColor(INK).text(`${date(p.paidAt)} · ${p.method.replace('_', ' ').toLowerCase()}${p.reference ? ` · ${p.reference}` : ''}`, L, y).text(inr(p.amount), L + 260, y, { width: 100, align: 'right' })
      y += 15
    }
  }

  doc.font('r').fontSize(8).fillColor(STONE).text(
    `Generated by Opervia. Tax is calculated at the ${business.taxLabel} rate configured for this business; it is not a statement of compliance with any specific tax regulation. Payments recorded in Opervia are bookkeeping entries, not processed transactions.`,
    L, doc.page.height - 84, { width: W, lineGap: 2 },
  )
  doc.end()
}
