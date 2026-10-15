/**
 * Seeds (or re-seeds) the demo workspace "Rao Electricals Pvt Ltd".
 *
 * The data is produced by simulating 200 days of trading in time order: goods are received, orders draw
 * stock down, some orders are cancelled and their stock returned, invoices are issued and paid. Every
 * stock movement, balance, invoice and payment is therefore consistent with the others.
 *
 * Safety: only businesses flagged isDemo are ever deleted. Re-seeding an existing demo workspace requires
 * ALLOW_DEMO_RESET=true, and the script refuses to run against NODE_ENV=production without it.
 */
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma, Prisma } from '../src/db.js'

const DEMO_PASSWORD = 'Demo@1234'
const DAYS = 200
const IST = 5.5 * 3_600_000

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r = rng(1587)
const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]
const between = (lo: number, hi: number) => lo + r() * (hi - lo)
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
function poisson(lambda: number) {
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (r() + r() + r() - 1.5) * 2))
  const L = Math.exp(-lambda); let k = 0, p = 1
  do { k++; p *= r() } while (p > L)
  return k - 1
}
const money = (n: number) => Math.round(n * 100) / 100

const SUPPLIERS = [
  ['Polycab Depot', 'Sanjay Mehta', 'orders@polycabdepot.in', '+91 20 2612 4410'],
  ['Precision Pipes', 'Anita Joshi', 'sales@precisionpipes.in', '+91 20 2745 1182'],
  ['Havells Distributors', 'Rohit Bansal', 'pune@havellsdist.in', '+91 20 2553 9021'],
  ['Lumen India', 'Kavya Iyer', 'trade@lumenindia.in', '+91 22 4012 7713'],
  ['Anchor Wholesale', 'Imran Shaikh', 'wholesale@anchorpune.in', '+91 20 2633 0198'],
  ['Crompton Traders', 'Deepa Nair', 'deepa@cromptontraders.in', '+91 20 2441 7765'],
  ['Hardware Hub', 'Vikram Desai', 'supply@hardwarehub.in', '+91 20 2701 3344'],
  ['Smartline Imports', 'Neha Kapoor', 'b2b@smartline.in', '+91 80 4719 2201'],
] as const
const CATEGORY_SUPPLIER: Record<string, number> = { Cables: 0, Conduits: 1, Protection: 2, Lighting: 3, Switchgear: 4, Fans: 5, Accessories: 6, 'Smart home': 7 }

// name, category, reorder level, average units sold per day, cost price (₹)
const PRODUCTS: [string, string, number, number, number][] = [
  ['Copper Wire 2.5mm, 90m', 'Cables', 40, 3.1, 2850], ['Copper Wire 1.5mm, 90m', 'Cables', 40, 2.6, 1890], ['Copper Wire 4mm, 90m', 'Cables', 25, 1.2, 4400],
  ['Armoured Cable 4 core 10mm', 'Cables', 10, 0.4, 9800], ['Flexible Cable 0.75mm', 'Cables', 30, 1.6, 1450], ['Coaxial RG6, 100m', 'Cables', 12, 0.5, 2600],
  ['PVC Conduit 20mm', 'Conduits', 60, 6.0, 38], ['PVC Conduit 25mm', 'Conduits', 50, 3.8, 52], ['GI Conduit 20mm', 'Conduits', 20, 0.9, 120],
  ['Flexible Conduit 25mm', 'Conduits', 25, 1.1, 64], ['Junction Box 4-way', 'Conduits', 80, 4.2, 46], ['Conduit Bend 20mm', 'Conduits', 120, 7.5, 18],
  ['MCB 32A Double Pole', 'Protection', 25, 1.9, 410], ['MCB 16A Single Pole', 'Protection', 40, 3.3, 168], ['MCB 6A Single Pole', 'Protection', 40, 2.4, 160],
  ['RCCB 40A 30mA', 'Protection', 15, 0.8, 1450], ['Distribution Board 8-way', 'Protection', 10, 0.6, 1880], ['Surge Protector Type 2', 'Protection', 8, 0.3, 3100],
  ['Isolator 63A', 'Protection', 10, 0.5, 760], ['Changeover Switch 63A', 'Protection', 6, 0.2, 2350],
  ['LED Panel 18W', 'Lighting', 30, 2.4, 340], ['LED Panel 12W', 'Lighting', 30, 2.0, 290], ['LED Batten 20W', 'Lighting', 40, 3.0, 260],
  ['LED Bulb 9W', 'Lighting', 150, 12.0, 62], ['Downlight 7W', 'Lighting', 60, 3.6, 210], ['Street Light 60W', 'Lighting', 8, 0.3, 2900],
  ['Flood Light 100W', 'Lighting', 10, 0.5, 1800], ['Emergency Light', 'Lighting', 12, 0.7, 980],
  ['Modular Switch 6A', 'Switchgear', 200, 14.0, 58], ['Modular Socket 16A', 'Switchgear', 120, 7.0, 96], ['Modular Plate 8M', 'Switchgear', 80, 3.4, 140],
  ['Fan Regulator', 'Switchgear', 60, 2.8, 260], ['Bell Push', 'Switchgear', 40, 1.0, 72], ['USB Socket Module', 'Switchgear', 30, 1.4, 640],
  ['Ceiling Fan 1200mm', 'Fans', 20, 1.3, 1850], ['Exhaust Fan 250mm', 'Fans', 15, 0.8, 980], ['Wall Fan 400mm', 'Fans', 10, 0.4, 1450],
  ['Insulation Tape', 'Accessories', 300, 18.0, 22], ['Cable Tie 200mm (100)', 'Accessories', 100, 5.0, 88], ['Earthing Electrode', 'Accessories', 10, 0.4, 1200],
  ['Lugs 10mm (50)', 'Accessories', 40, 1.5, 260], ['Wall Plug 6mm (100)', 'Accessories', 60, 2.2, 90], ['Cable Clip 20mm (100)', 'Accessories', 80, 3.0, 120],
  ['Smart Plug Wi-Fi', 'Smart home', 15, 0.6, 980], ['Motion Sensor', 'Smart home', 10, 0.4, 760], ['Smart Switch 2-gang', 'Smart home', 10, 0.5, 1150],
  ['Video Door Phone', 'Smart home', 5, 0.2, 6400], ['Energy Meter 1-phase', 'Smart home', 12, 0.5, 1280],
]
// Products whose restocking stalls near the end, so the workspace opens with real attention items.
const STALLED = new Set([12, 17, 46, 0, 6, 28, 20, 15])

const CUSTOMERS = [
  ['Patil Constructions', 'Suresh Patil', 'Baner'], ['Shree Ganesh Traders', 'Ganesh Kale', 'Shivajinagar'], ['Deshmukh Builders', 'Amit Deshmukh', 'Wakad'],
  ['Sahyadri Hospitals', 'Facilities desk', 'Deccan'], ['Nova Interiors LLP', 'Priya Menon', 'Koregaon Park'], ['Kulkarni and Sons', 'Mohan Kulkarni', 'Kothrud'],
  ['Aarav Electricals', 'Aarav Shah', 'Hadapsar'], ['Metro Fab Works', 'Farhan Qureshi', 'Bhosari'], ['Riverside Apartments CHS', 'Society office', 'Aundh'],
  ['Pune Smart Offices', 'Rhea Fernandes', 'Hinjewadi'], ['Gokhale Hardware', 'Nitin Gokhale', 'Sadashiv Peth'], ['Bluebell School', 'Admin office', 'Viman Nagar'],
  ['Om Sai Contractors', 'Rajesh Pawar', 'Pimpri'], ['Lotus Hotels', 'Maintenance', 'Camp'],
] as const
const CUSTOMER_WEIGHT = [9, 7, 8, 5, 5, 4, 6, 3, 3, 4, 4, 2, 5, 3]

async function main() {
  const existing = await prisma.business.findMany({ where: { isDemo: true }, select: { id: true } })
  const envAllow = process.env.ALLOW_DEMO_RESET === 'true'
  // In production only the environment variable can allow it; a command-line flag is not enough.
  if (process.env.NODE_ENV === 'production' && !envAllow) throw new Error('Refusing to seed in production without ALLOW_DEMO_RESET=true.')
  const allow = envAllow || process.argv.includes('--reset')
  if (existing.length && !allow) throw new Error('A demo workspace already exists. Set ALLOW_DEMO_RESET=true to replace it (only demo workspaces are touched).')
  for (const b of existing) await wipeBusiness(b.id)

  const t0 = Date.now()
  const now = new Date()
  const todayLocal = new Date(Math.floor((now.getTime() + IST) / 86_400_000) * 86_400_000) // 00:00 local, expressed in "local ms"
  const at = (dayIndex: number, hour: number) => new Date(todayLocal.getTime() - (DAYS - 1 - dayIndex) * 86_400_000 + hour * 3_600_000 - IST)
  const past = (d: Date) => new Date(Math.min(d.getTime(), now.getTime() - 60_000))

  const businessId = randomUUID()
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const users = [
    { id: randomUUID(), name: 'Meera Rao', email: 'admin@opervia.demo', role: 'ADMIN' as const },
    { id: randomUUID(), name: 'Arjun Kulkarni', email: 'manager@opervia.demo', role: 'MANAGER' as const },
    { id: randomUUID(), name: 'Ravi Patil', email: 'staff@opervia.demo', role: 'STAFF' as const },
  ]
  const [admin, manager, staff] = users
  const categories = [...new Set(PRODUCTS.map((p) => p[1]))].map((name) => ({ id: randomUUID(), name }))
  const suppliers = SUPPLIERS.map(([name, contactName, email, phone], i) => ({ id: randomUUID(), name, contactName, email, phone, address: ['Bhosari MIDC, Pune', 'Chakan, Pune', 'Market Yard, Pune', 'Andheri East, Mumbai', 'Rasta Peth, Pune', 'Hadapsar, Pune', 'Bhosari, Pune', 'Whitefield, Bengaluru'][i] }))
  const customers = CUSTOMERS.map(([name, contactName, area], i) => ({ id: randomUUID(), name, contactName, area, email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '')}.in`, phone: `+91 98${String(22_000_000 + i * 731_219).slice(0, 8)}` }))
  const products = PRODUCTS.map(([name, cat, reorder, daily, cost], i) => ({
    id: randomUUID(), sku: `SKU-${String(1000 + i * 37).padStart(4, '0')}`, name, categoryId: categories.find((c) => c.name === cat)!.id,
    supplierIdx: CATEGORY_SUPPLIER[cat], reorder, daily, cost, price: Math.round(cost * between(1.28, 1.42)), stock: 0,
  }))

  type Mv = { id: string; productId: string; type: 'OPENING' | 'PURCHASE_RECEIPT' | 'SALE' | 'SALE_CANCELLED'; quantity: number; balanceAfter: number; reference: string; userId: string | null; createdAt: Date }
  const movements: Mv[] = []
  let lastMove = 0
  const move = (p: (typeof products)[number], type: Mv['type'], qty: number, ref: string, at: Date, userId: string | null) => {
    const when = new Date(Math.max(at.getTime(), lastMove + 1)) // strictly increasing, so ledger order is unambiguous
    lastMove = when.getTime()
    p.stock += qty
    if (p.stock < 0) throw new Error('Simulation drove stock negative')
    movements.push({ id: randomUUID(), productId: p.id, type, quantity: qty, balanceAfter: p.stock, reference: ref, userId, createdAt: when })
  }
  const audits: Prisma.AuditLogCreateManyInput[] = []
  const log = (dayIndex: number, when: Date, userId: string | null, action: string, entity: string, entityId: string, summary: string) => {
    if (dayIndex >= DAYS - 10) audits.push({ id: randomUUID(), businessId, userId, action, entity, entityId, summary, createdAt: past(when) })
  }

  // Opening balances
  for (const p of products) move(p, 'OPENING', p.reorder * 3, 'Opening balance', at(0, 8), admin.id)

  const pos: { id: string; number: string; supplierIdx: number; status: string; orderedAt: Date; receivedAt: Date | null; expectedAt: Date; items: { id: string; productId: string; quantity: number; receivedQty: number; unitCost: number }[] }[] = []
  const pending: { po: (typeof pos)[number]; day: number; partial: boolean }[] = []
  const onOrder = new Set<string>()
  const orders: { id: string; number: string; customerIdx: number; status: string; createdAt: Date; confirmedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; discount: number; stockApplied: boolean; createdById: string; items: { id: string; productId: string; quantity: number; unitPrice: number; unitCost: number }[] }[] = []
  let soN = 0, poN = 0

  for (let d = 0; d < DAYS; d++) {
    const dayDate = at(d, 0)
    const dow = new Date(dayDate.getTime() + IST).getUTCDay()
    const age = DAYS - 1 - d

    // 09:00 — deliveries due today
    const zeroAtStart = new Set(products.filter((p) => p.stock === 0).map((p) => p.id))
    for (const pend of pending.filter((x) => x.day === d)) {
      const when = at(d, 9 + r())
      if (when > now) continue
      for (const it of pend.po.items) {
        const q = pend.partial ? Math.ceil(it.quantity / 2) : it.quantity - it.receivedQty
        if (q <= 0) continue
        it.receivedQty += q
        move(products.find((p) => p.id === it.productId)!, 'PURCHASE_RECEIPT', q, pend.po.number, when, pick([admin.id, staff.id]))
      }
      const complete = pend.po.items.every((i) => i.receivedQty === i.quantity)
      pend.po.status = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
      if (complete) { pend.po.receivedAt = when; pend.po.items.forEach((i) => onOrder.delete(i.productId)) }
      log(d, when, staff.id, 'purchaseOrder.received', 'PurchaseOrder', pend.po.id, `Received ${pend.po.items.reduce((s, i) => s + i.receivedQty, 0)} units against ${pend.po.number}${complete ? ' — order complete' : ''}`)
    }

    // Sales: per-product demand for the day, spread across the day's orders
    const season = dow === 0 ? 0.35 : dow === 6 ? 0.8 : 1
    const trend = 0.85 + (0.3 * d) / DAYS
    const orderCount = dow === 0 ? int(1, 3) : int(6, 10)
    const dayOrders = Array.from({ length: orderCount }, () => {
      const hour = between(9.5, 19.5)
      let w = r() * CUSTOMER_WEIGHT.reduce((a, b) => a + b, 0), customerIdx = 0
      while ((w -= CUSTOMER_WEIGHT[customerIdx]) > 0) customerIdx++
      return { hour, customerIdx, lines: new Map<number, number>() }
    }).filter((o) => at(d, o.hour).getTime() < now.getTime() - 20 * 60_000).sort((a, b) => a.hour - b.hour)
    if (dayOrders.length === 0) continue
    products.forEach((p, pi) => {
      const demand = poisson(p.daily * season * trend)
      for (let u = 0; u < demand; u++) {
        const o = dayOrders[Math.floor(r() * dayOrders.length)]
        o.lines.set(pi, (o.lines.get(pi) ?? 0) + 1)
      }
    })

    const cancelLater: (typeof orders)[number][] = []
    for (const o of dayOrders) {
      if (o.lines.size === 0) continue
      const createdAt = at(d, o.hour)
      const number = `SO-${String(++soN).padStart(4, '0')}`
      const id = randomUUID()
      const createdById = pick([admin.id, manager.id, staff.id, staff.id])
      // Lifecycle depends on how long ago the order was placed.
      const roll = r()
      let status: string
      if (age > 4) status = roll < 0.03 ? 'CANCELLED_DRAFT' : roll < 0.08 ? 'CANCELLED' : 'COMPLETED'
      else if (age > 1) status = roll < 0.15 ? 'PROCESSING' : roll < 0.2 ? 'CANCELLED' : 'COMPLETED'
      else status = roll < 0.25 ? 'DRAFT' : roll < 0.55 ? 'CONFIRMED' : roll < 0.8 ? 'PROCESSING' : 'COMPLETED'

      const items: (typeof orders)[number]['items'] = []
      const confirms = status !== 'DRAFT' && status !== 'CANCELLED_DRAFT'
      for (const [pi, want] of o.lines) {
        const p = products[pi]
        const qty = confirms ? Math.min(want, p.stock) : want
        if (qty <= 0) continue
        items.push({ id: randomUUID(), productId: p.id, quantity: qty, unitPrice: p.price, unitCost: p.cost })
      }
      if (!items.length) continue
      const confirmedAt = confirms ? past(new Date(createdAt.getTime() + int(5, 90) * 60_000)) : null
      let completedAt = status === 'COMPLETED' ? past(new Date(createdAt.getTime() + between(0.3, Math.min(3, Math.max(0.4, age))) * 86_400_000)) : null
      if (completedAt && confirmedAt && completedAt.getTime() <= confirmedAt.getTime() + 5 * 60_000) { status = 'CONFIRMED'; completedAt = null }
      if (confirms) for (const it of items) move(products.find((p) => p.id === it.productId)!, 'SALE', -it.quantity, number, confirmedAt!, createdById)
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      const discount = r() < 0.15 ? Math.round(subtotal * between(0.02, 0.05)) : 0
      const order = {
        id, number, customerIdx: o.customerIdx, status: status === 'CANCELLED_DRAFT' ? 'CANCELLED' : status, createdAt, confirmedAt,
        completedAt,
        cancelledAt: status === 'CANCELLED_DRAFT' ? new Date(createdAt.getTime() + 3 * 3_600_000) : null,
        discount, stockApplied: confirms, createdById, items,
      }
      orders.push(order)
      log(d, createdAt, createdById, 'salesOrder.created', 'SalesOrder', id, `Drafted ${number} for ${customers[o.customerIdx].name}`)
      if (confirmedAt) log(d, confirmedAt, createdById, 'salesOrder.confirmed', 'SalesOrder', id, `Confirmed ${number}; ${items.length} lines reserved from stock`)
      if (order.completedAt) log(d, order.completedAt, manager.id, 'salesOrder.completed', 'SalesOrder', id, `Completed ${number}`)
      if (status === 'CANCELLED') cancelLater.push(order)
    }

    // 21:00 — cancellations of confirmed orders return their stock
    for (const o of cancelLater) {
      const when = at(d, 21)
      o.cancelledAt = when
      o.stockApplied = false
      for (const it of o.items) move(products.find((p) => p.id === it.productId)!, 'SALE_CANCELLED', it.quantity, o.number, when, manager.id)
      log(d, when, manager.id, 'salesOrder.cancelled', 'SalesOrder', o.id, `Cancelled ${o.number}; stock returned`)
    }
    for (const p of products) if (p.stock === 0 && !zeroAtStart.has(p.id)) log(d, at(d, 21.5), null, 'stock.depleted', 'Product', p.id, `${p.name} reached zero stock`)

    // 18:00 — reorder what has fallen below its reorder level (stalled products stop being reordered late on)
    const toOrder = products.filter((p, i) => p.stock <= p.reorder && !onOrder.has(p.id) && !(STALLED.has(i) && age < 26))
    const bySupplier = new Map<number, typeof toOrder>()
    toOrder.forEach((p) => bySupplier.set(p.supplierIdx, [...(bySupplier.get(p.supplierIdx) ?? []), p]))
    for (const [supplierIdx, list] of bySupplier) {
      const id = randomUUID(), number = `PO-${String(++poN).padStart(4, '0')}`
      const orderedAt = past(at(d, 18)), lead = int(2, 6)
      const po = { id, number, supplierIdx, status: 'ORDERED', orderedAt, receivedAt: null, expectedAt: at(d + lead, 10), items: list.map((p) => ({ id: randomUUID(), productId: p.id, quantity: Math.max(p.reorder * 3 - p.stock, p.reorder), receivedQty: 0, unitCost: p.cost })) }
      pos.push(po)
      list.forEach((p) => onOrder.add(p.id))
      const partial = r() < 0.12
      if (d + lead < DAYS) pending.push({ po, day: d + lead, partial })
      if (partial && d + lead + 2 < DAYS) pending.push({ po, day: d + lead + 2, partial: false })
      log(d, orderedAt, manager.id, 'purchaseOrder.submitted', 'PurchaseOrder', id, `Sent ${number} to ${suppliers[supplierIdx].name}`)
    }
  }
  // A couple of drafts waiting for review
  for (const supplierIdx of [3, 7]) {
    const id = randomUUID(), number = `PO-${String(++poN).padStart(4, '0')}`
    const list = products.filter((p) => p.supplierIdx === supplierIdx).slice(0, 3)
    pos.push({ id, number, supplierIdx, status: 'DRAFT', orderedAt: null as unknown as Date, receivedAt: null, expectedAt: at(DAYS + 5, 10), items: list.map((p) => ({ id: randomUUID(), productId: p.id, quantity: p.reorder * 2, receivedQty: 0, unitCost: p.cost })) })
  }

  // Invoices for completed orders, payments by age
  const TAX = 18
  const totals = (items: { quantity: number; unitPrice: number }[], discount: number) => {
    const subtotal = money(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
    const tax = money((subtotal - discount) * TAX / 100)
    return { subtotal, tax, total: money(subtotal - discount + tax) }
  }
  let invN = 0
  const invoices: Prisma.InvoiceCreateManyInput[] = [], invoiceItems: Prisma.InvoiceItemCreateManyInput[] = [], payments: Prisma.PaymentCreateManyInput[] = []
  for (const o of orders.filter((x) => x.status === 'COMPLETED').sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime())) {
    const t = totals(o.items, o.discount)
    const issue = o.completedAt!
    const ageDays = (now.getTime() - issue.getTime()) / 86_400_000
    const id = randomUUID(), number = `INV-${String(++invN).padStart(4, '0')}`
    const roll = r()
    let paid = 0
    const pay = (amount: number, afterDays: number) => {
      const when = new Date(Math.min(now.getTime() - 600_000, issue.getTime() + afterDays * 86_400_000))
      payments.push({ id: randomUUID(), businessId, invoiceId: id, amount: money(amount), method: pick(['BANK_TRANSFER', 'UPI', 'UPI', 'CHEQUE', 'CASH'] as const), reference: `UTR${int(100000, 999999)}`, isDemo: true, paidAt: when, userId: manager.id, createdAt: when })
      paid = money(paid + amount)
      if (when.getTime() > now.getTime() - 10 * 86_400_000) audits.push({ id: randomUUID(), businessId, userId: manager.id, action: 'payment.recorded', entity: 'Invoice', entityId: id, summary: `${number} ${money(paid) >= t.total ? 'paid in full' : 'part-paid'} ₹${Math.round(amount).toLocaleString('en-IN')} by ${customers[o.customerIdx].name}`, createdAt: when })
    }
    if (ageDays > 45) { if (roll < 0.99) pay(t.total, between(2, 28)); else pay(Math.round(t.total * 0.5), between(5, 20)) }
    else if (ageDays > 16) { if (roll < 0.8) pay(t.total, between(2, Math.min(15, ageDays - 1))); else if (roll < 0.9) pay(Math.round(t.total * 0.5), between(2, 10)) }
    else if (roll < 0.3) pay(t.total, between(0.2, Math.max(0.3, ageDays - 0.1)))
    invoices.push({ id, businessId, number, salesOrderId: o.id, customerId: customers[o.customerIdx].id, status: paid === 0 ? 'UNPAID' : paid >= t.total ? 'PAID' : 'PARTIALLY_PAID', issueDate: issue, dueDate: new Date(issue.getTime() + 15 * 86_400_000), subtotal: t.subtotal, discount: o.discount, taxRate: TAX, taxAmount: t.tax, total: t.total, amountPaid: Math.min(paid, t.total), createdAt: issue })
    for (const it of o.items) { const p = products.find((x) => x.id === it.productId)!; invoiceItems.push({ id: randomUUID(), invoiceId: id, productId: p.id, description: p.name, sku: p.sku, quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: money(it.quantity * it.unitPrice) }) }
    if (issue.getTime() > now.getTime() - 10 * 86_400_000) audits.push({ id: randomUUID(), businessId, userId: admin.id, action: 'invoice.issued', entity: 'Invoice', entityId: id, summary: `Issued ${number} to ${customers[o.customerIdx].name}`, createdAt: issue })
  }

  // Write everything
  await prisma.$transaction(async (tx) => {
    await tx.business.create({ data: { id: businessId, name: 'Rao Electricals Pvt Ltd', city: 'Pune', isDemo: true, taxRate: TAX, taxLabel: 'GST', paymentTermsDays: 15 } })
    await tx.user.createMany({ data: users.map((u) => ({ ...u, businessId, passwordHash: hash })) })
    await tx.category.createMany({ data: categories.map((c) => ({ ...c, businessId })) })
    await tx.supplier.createMany({ data: suppliers.map((s, i) => ({ ...s, businessId, gstin: `27AAB${String(1000 + i * 77).slice(0, 4)}C1Z${i}`.padEnd(15, '5').slice(0, 15) })) })
    await tx.customer.createMany({ data: customers.map(({ area, ...c }) => ({ ...c, businessId, address: `${area}, Pune` })) })
    await tx.product.createMany({ data: products.map((p) => ({ id: p.id, businessId, sku: p.sku, name: p.name, categoryId: p.categoryId, supplierId: suppliers[p.supplierIdx].id, costPrice: p.cost, sellingPrice: p.price, stockQty: p.stock, reorderLevel: p.reorder, createdAt: at(0, 8) })) })
    await tx.inventoryMovement.createMany({ data: movements.map((m) => ({ ...m, businessId })) })
    await tx.purchaseOrder.createMany({ data: pos.map((po) => {
      const subtotal = money(po.items.reduce((s, i) => s + i.quantity * i.unitCost, 0)), tax = money(subtotal * TAX / 100)
      return { id: po.id, businessId, number: po.number, supplierId: suppliers[po.supplierIdx].id, status: po.status as 'DRAFT', subtotal, taxAmount: tax, total: money(subtotal + tax), orderedAt: po.orderedAt, receivedAt: po.receivedAt, expectedAt: po.expectedAt, createdById: manager.id, createdAt: po.orderedAt ?? now }
    }) })
    await tx.purchaseOrderItem.createMany({ data: pos.flatMap((po) => po.items.map((i) => ({ ...i, purchaseOrderId: po.id, lineTotal: money(i.quantity * i.unitCost) }))) })
    await tx.salesOrder.createMany({ data: orders.map((o) => {
      const t = totals(o.items, o.discount)
      return { id: o.id, businessId, number: o.number, customerId: customers[o.customerIdx].id, status: o.status as 'DRAFT', subtotal: t.subtotal, discount: o.discount, taxRate: TAX, taxAmount: t.tax, total: t.total, stockApplied: o.stockApplied, confirmedAt: o.confirmedAt, completedAt: o.completedAt, cancelledAt: o.cancelledAt, createdById: o.createdById, createdAt: o.createdAt }
    }) })
    await tx.salesOrderItem.createMany({ data: orders.flatMap((o) => o.items.map((i) => ({ ...i, salesOrderId: o.id, lineTotal: money(i.quantity * i.unitPrice) }))) })
    await tx.invoice.createMany({ data: invoices })
    await tx.invoiceItem.createMany({ data: invoiceItems })
    await tx.payment.createMany({ data: payments })
    await tx.auditLog.createMany({ data: audits })
    await tx.counter.createMany({ data: [{ businessId, key: 'SO', value: soN }, { businessId, key: 'PO', value: poN }, { businessId, key: 'INV', value: invN }] })
  }, { timeout: 120_000 })

  const low = products.filter((p) => p.stock > 0 && p.stock <= p.reorder).length, out = products.filter((p) => p.stock === 0).length
  console.log(`Demo workspace ready in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${orders.length} sales orders, ${pos.length} purchase orders, ${invoices.length} invoices, ${payments.length} payments, ${movements.length} stock movements; ${low} low and ${out} out of stock.`)
  console.log(`Sign in with admin@opervia.demo, manager@opervia.demo or staff@opervia.demo — password ${DEMO_PASSWORD}`)
}

async function wipeBusiness(id: string) {
  await prisma.$transaction(async (tx) => {
    const w = { businessId: id }
    await tx.payment.deleteMany({ where: w })
    await tx.invoiceItem.deleteMany({ where: { invoice: w } })
    await tx.invoice.deleteMany({ where: w })
    await tx.salesOrderItem.deleteMany({ where: { salesOrder: w } })
    await tx.salesOrder.deleteMany({ where: w })
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: w } })
    await tx.purchaseOrder.deleteMany({ where: w })
    await tx.inventoryMovement.deleteMany({ where: w })
    await tx.product.deleteMany({ where: w })
    await tx.business.delete({ where: { id } })
  }, { timeout: 60_000 })
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1) })
