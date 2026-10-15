import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { Client, customer, login, newWorkspace, stockedProduct } from './helpers.js'

afterAll(async () => { await prisma.$disconnect() })

const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty

describe('authentication and sessions', () => {
  it('registers, reads the session, rejects bad passwords and logs out', async () => {
    const { c, email } = await newWorkspace('auth')
    const me = await c.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.data.user.role).toBe('ADMIN')
    expect(me.body.data.permissions).toContain('users:manage')

    const bad = await (await new Client().init()).post('/auth/login', { email, password: 'WrongPass1' })
    expect(bad.status).toBe(401)
    expect(bad.body.message).toBe('Email or password is incorrect.')
    const unknown = await (await new Client().init()).post('/auth/login', { email: 'nobody@example.com', password: 'WrongPass1' })
    expect(unknown.body.message).toBe(bad.body.message)

    await c.post('/auth/logout')
    expect((await c.get('/auth/me')).status).toBe(401)
  })

  it('rejects state-changing requests without a matching CSRF token', async () => {
    const { c } = await newWorkspace('csrf')
    const r = await c.agent.post('/api/customers').send({ name: 'No Token Ltd' })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('CSRF')
    const wrong = await c.agent.post('/api/customers').set('X-CSRF-Token', 'x'.repeat(64)).send({ name: 'Wrong Token Ltd' })
    expect(wrong.status).toBe(403)
  })

  it('rejects weak passwords and duplicate emails with field errors', async () => {
    const c = await new Client().init()
    const weak = await c.post('/auth/register', { name: 'A Person', business: 'Biz', email: 'weak@example.com', password: 'short' })
    expect(weak.status).toBe(400)
    expect(weak.body.errors[0].path).toBe('password')
    const { email } = await newWorkspace('dup')
    const dup = await (await new Client().init()).post('/auth/register', { name: 'A Person', business: 'Biz', email, password: 'Passw0rdX' })
    expect(dup.status).toBe(409)
  })

  it('signs a user out everywhere when an admin changes their role', async () => {
    const { c } = await newWorkspace('revoke')
    const u = (await c.post('/users', { name: 'Staff Person', email: `revoke${Date.now()}@example.com`, role: 'STAFF', password: 'Passw0rdX' })).body.data
    const staff = await login(u.email, 'Passw0rdX')
    expect((await staff.get('/auth/me')).status).toBe(200)
    await c.patch(`/users/${u.id}`, { role: 'MANAGER' })
    expect((await staff.get('/auth/me')).status).toBe(401)
  })
})

describe('role-based access, enforced on the server', () => {
  it('limits staff to operational work', async () => {
    const { c: admin } = await newWorkspace('rbac')
    const email = `staff${Date.now()}@example.com`
    expect((await admin.post('/users', { name: 'Staff Person', email, role: 'STAFF', password: 'Passw0rdX' })).status).toBe(201)
    const staff = await login(email, 'Passw0rdX')
    const { product } = await stockedProduct(admin, 20)

    expect((await staff.post('/products', { sku: 'NOPE-1', name: 'Nope', costPrice: 1, sellingPrice: 2, reorderLevel: 0 })).status).toBe(403)
    expect((await staff.get('/analytics/report')).status).toBe(403)
    expect((await staff.get('/users')).status).toBe(403)
    expect((await staff.get('/audit')).status).toBe(403)
    expect((await staff.patch('/settings', { taxRate: 5 })).status).toBe(403)

    const overview = await staff.get('/analytics/overview?range=30d')
    expect(overview.status).toBe(200)
    expect(overview.body.data.revenue).toBeNull()
    expect(overview.body.data.stock.valueAtCost).toBeNull()

    // Staff can run the sales workflow but cannot cancel a confirmed order or see unit costs.
    const cust = await customer(staff)
    const so = (await staff.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 2 }] })).body.data
    expect(so.items[0].unitCost).toBeUndefined()
    expect((await staff.post(`/sales-orders/${so.id}/confirm`)).status).toBe(200)
    expect((await staff.post(`/sales-orders/${so.id}/cancel`)).status).toBe(403)
    expect((await admin.post(`/sales-orders/${so.id}/cancel`)).status).toBe(200)
  })
})

describe('workspace isolation', () => {
  it('never returns or changes another workspace’s records', async () => {
    const { c: a } = await newWorkspace('tenantA')
    const { c: b } = await newWorkspace('tenantB')
    const { product, supplier } = await stockedProduct(a, 5)
    expect((await b.get(`/products/${product.id}`)).status).toBe(404)
    expect((await b.patch(`/products/${product.id}`, { name: 'Hijacked' })).status).toBe(404)
    expect((await b.get(`/suppliers/${supplier.id}`)).status).toBe(404)
    expect((await b.post(`/products/${product.id}/adjust`, { quantity: -5, note: 'steal stock' })).status).toBe(404)
    const custB = await customer(b)
    const r = await b.post('/sales-orders', { customerId: custB.id, items: [{ productId: product.id, quantity: 1 }] })
    expect(r.status).toBe(422)
    expect((await b.get('/products')).body.data.total).toBe(0)
    expect(await stockOf(product.id)).toBe(5)
  })
})

describe('purchase orders and receiving', () => {
  it('receives partially, refuses over-receiving and completes the order', async () => {
    const { c } = await newWorkspace('po')
    const { product, supplier } = await stockedProduct(c, 0)
    const po = (await c.post('/purchase-orders', { supplierId: supplier.id, items: [{ productId: product.id, quantity: 10, unitCost: 80 }] })).body.data
    expect(po.status).toBe('DRAFT')
    expect(po.total).toBe(944) // 800 + 18% GST
    expect((await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 1 }] })).status).toBe(409) // not ordered yet
    await c.post(`/purchase-orders/${po.id}/submit`)
    expect((await c.post(`/purchase-orders/${po.id}/submit`)).status).toBe(409)

    const part = await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 4 }] })
    expect(part.body.data.status).toBe('PARTIALLY_RECEIVED')
    expect(await stockOf(product.id)).toBe(4)

    const over = await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 7 }] })
    expect(over.status).toBe(409)
    expect(over.body.details.remaining).toBe(6)
    expect(await stockOf(product.id)).toBe(4)

    const rest = await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 6 }] })
    expect(rest.body.data.status).toBe('RECEIVED')
    expect(await stockOf(product.id)).toBe(10)
    expect((await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 1 }] })).status).toBe(409)
    expect((await c.post(`/purchase-orders/${po.id}/cancel`)).status).toBe(409)

    const moves = await prisma.inventoryMovement.findMany({ where: { productId: product.id }, orderBy: { createdAt: 'asc' } })
    expect(moves.map((m) => m.balanceAfter)).toEqual([4, 10])
  })

  it('replays an idempotent receipt instead of applying it twice', async () => {
    const { c } = await newWorkspace('idem')
    const { product, supplier } = await stockedProduct(c, 0)
    const po = (await c.post('/purchase-orders', { supplierId: supplier.id, items: [{ productId: product.id, quantity: 10, unitCost: 50 }] })).body.data
    await c.post(`/purchase-orders/${po.id}/submit`)
    const body = { items: [{ itemId: po.items[0].id, quantity: 3 }] }
    const first = await c.post(`/purchase-orders/${po.id}/receive`, body, { 'Idempotency-Key': 'receipt-1' })
    await new Promise((r) => setTimeout(r, 50))
    const again = await c.post(`/purchase-orders/${po.id}/receive`, body, { 'Idempotency-Key': 'receipt-1' })
    expect(first.status).toBe(200)
    expect(again.headers['idempotent-replay']).toBe('true')
    expect(await stockOf(product.id)).toBe(3)
  })
})

describe('sales orders and stock', () => {
  it('deducts on confirm, blocks overselling and restores exactly once on cancel', async () => {
    const { c } = await newWorkspace('so')
    const { product } = await stockedProduct(c, 10, { price: 200 })
    const cust = await customer(c)
    const a = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 8 }], discount: 100 })).body.data
    expect(a.subtotal).toBe(1600)
    expect(a.taxAmount).toBe(270) // 18% of 1500
    expect(a.total).toBe(1770)
    expect(await stockOf(product.id)).toBe(10) // drafts do not touch stock

    expect((await c.post(`/sales-orders/${a.id}/confirm`)).status).toBe(200)
    expect(await stockOf(product.id)).toBe(2)
    expect((await c.post(`/sales-orders/${a.id}/confirm`)).status).toBe(409)

    const b = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 5 }] })).body.data
    const fail = await c.post(`/sales-orders/${b.id}/confirm`)
    expect(fail.status).toBe(409)
    expect(fail.body.details).toMatchObject({ available: 2, requested: 5 })
    expect((await c.get(`/sales-orders/${b.id}`)).body.data.status).toBe('DRAFT')
    expect(await stockOf(product.id)).toBe(2)

    expect((await c.post(`/sales-orders/${a.id}/cancel`)).body.data.status).toBe('CANCELLED')
    expect(await stockOf(product.id)).toBe(10)
    expect((await c.post(`/sales-orders/${a.id}/cancel`)).status).toBe(409)
    expect(await stockOf(product.id)).toBe(10)
    expect((await c.post(`/sales-orders/${a.id}/process`)).status).toBe(409)
  })

  it('lets only one of two simultaneous confirmations take the last units', async () => {
    const { c } = await newWorkspace('race')
    const { product } = await stockedProduct(c, 10)
    const cust = await customer(c)
    const o1 = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 6 }] })).body.data
    const o2 = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 6 }] })).body.data
    const results = await Promise.all([c.post(`/sales-orders/${o1.id}/confirm`), c.post(`/sales-orders/${o2.id}/confirm`)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await stockOf(product.id)).toBe(4)
  })

  it('takes prices from the product record, not the request', async () => {
    const { c } = await newWorkspace('price')
    const { product } = await stockedProduct(c, 5, { price: 300 })
    const cust = await customer(c)
    const o = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 1, unitPrice: 1 }] })).body.data
    expect(o.items[0].unitPrice).toBe(300)
    expect((await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 1 }], discount: 999 })).status).toBe(422)
  })
})

describe('invoices and payments', () => {
  it('invoices once, prevents overpayment and settles in parts', async () => {
    const { c } = await newWorkspace('inv')
    const { product } = await stockedProduct(c, 10, { price: 500 })
    const cust = await customer(c)
    const o = (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 2 }] })).body.data
    expect((await c.post('/invoices', { salesOrderId: o.id })).status).toBe(409) // draft cannot be invoiced
    await c.post(`/sales-orders/${o.id}/confirm`)
    await c.post(`/sales-orders/${o.id}/complete`)
    const inv = (await c.post('/invoices', { salesOrderId: o.id })).body.data
    expect(inv.total).toBe(1180)
    expect(inv.outstanding).toBe(1180)
    expect((await c.post('/invoices', { salesOrderId: o.id })).status).toBe(409)

    // A later price change does not alter the issued invoice.
    await c.patch(`/products/${product.id}`, { sellingPrice: 900 })
    expect((await c.get(`/invoices/${inv.id}`)).body.data.items[0].unitPrice).toBe(500)

    expect((await c.post(`/invoices/${inv.id}/payments`, { amount: 2000, method: 'UPI' })).status).toBe(422)
    const p1 = await c.post(`/invoices/${inv.id}/payments`, { amount: 500, method: 'UPI', reference: 'UTR1' })
    expect(p1.body.data.status).toBe('PARTIALLY_PAID')
    expect(p1.body.data.outstanding).toBe(680)

    const both = await Promise.all([c.post(`/invoices/${inv.id}/payments`, { amount: 600, method: 'CASH' }), c.post(`/invoices/${inv.id}/payments`, { amount: 600, method: 'CASH' })])
    expect(both.map((r) => r.status).sort()).toEqual([201, 422])
    const last = await c.post(`/invoices/${inv.id}/payments`, { amount: 80, method: 'BANK_TRANSFER' })
    expect(last.body.data.status).toBe('PAID')
    expect((await c.post(`/invoices/${inv.id}/payments`, { amount: 1, method: 'CASH' })).status).toBe(409)
    expect((await c.post(`/sales-orders/${o.id}/cancel`)).status).toBe(409) // completed orders cannot be cancelled

    const pdf = await c.get(`/invoices/${inv.id}/pdf`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (d: Buffer) => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks))) })
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')
  })
})

describe('analytics', () => {
  it('counts confirmed revenue after discount and ignores cancelled orders', async () => {
    const { c } = await newWorkspace('analytics')
    const { product } = await stockedProduct(c, 50, { price: 100, cost: 60 })
    const cust = await customer(c)
    const make = async (qty: number, discount = 0) => (await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: qty }], discount })).body.data
    const a = await make(10, 50), b = await make(5), cancelled = await make(7), draft = await make(3)
    for (const o of [a, b, cancelled]) await c.post(`/sales-orders/${o.id}/confirm`)
    await c.post(`/sales-orders/${cancelled.id}/cancel`)

    const ov = (await c.get('/analytics/overview?range=7d')).body.data
    expect(ov.revenue.total).toBe(1000 - 50 + 500)
    expect(ov.ledger.find((m: { key: string }) => m.key === 'orders').value).toBe(2)
    const margin = ov.ledger.find((m: { key: string }) => m.key === 'margin').value
    expect(margin).toBeCloseTo(((1450 - 900) / 1450) * 100, 5)
    expect(ov.series.current.reduce((s: number, v: number) => s + v, 0)).toBe(1450)
    expect(ov.stock.items[0].onHand).toBe(35)
    expect(draft.status).toBe('DRAFT')

    const report = (await c.get('/analytics/report')).body.data
    expect(report.summary.revenue).toBe(1450)
    expect(report.topProducts[0]).toMatchObject({ quantity: 15, revenue: 1450 })
    expect((await c.get('/analytics/report?from=2020-01-01&to=2026-01-01')).status).toBe(400)
  })
})

describe('assistant (offline mode)', () => {
  it('routes questions to permitted tools and refuses the rest', async () => {
    const { c } = await newWorkspace('ai')
    await stockedProduct(c, 1, { reorder: 5 })
    const low = (await c.post('/assistant/ask', { question: 'Which products need restocking?' })).body.data
    expect(low.tool).toBe('getLowStockProducts')
    expect(low.mode).toBe('offline')
    expect(low.table.rows[0][0]).toBe('Widget')

    const none = (await c.post('/assistant/ask', { question: 'Write me a poem about the sea' })).body.data
    expect(none.tool).toBeNull()

    const email = `aistaff${Date.now()}@example.com`
    await c.post('/users', { name: 'Staff Person', email, role: 'STAFF', password: 'Passw0rdX' })
    const staff = await login(email, 'Passw0rdX')
    const denied = (await staff.post('/assistant/ask', { question: 'Compare revenue with the previous month' })).body.data
    expect(denied.summary).toMatch(/role does not have access/)
    expect(denied.metrics).toBeUndefined()
  })
})

describe('validation and safe deletion', () => {
  it('returns field errors and protects records with history', async () => {
    const { c } = await newWorkspace('val')
    const bad = await c.post('/suppliers', { name: 'X', email: 'not-an-email' })
    expect(bad.status).toBe(400)
    expect(bad.body.errors.map((e: { path: string }) => e.path)).toEqual(expect.arrayContaining(['name', 'email']))
    expect((await c.post('/products', { sku: 'NEG-1', name: 'Negative', costPrice: -5, sellingPrice: 10, reorderLevel: 0 })).status).toBe(400)

    const { product, supplier } = await stockedProduct(c, 3)
    expect((await c.del(`/products/${product.id}`)).status).toBe(409)
    expect((await c.del(`/suppliers/${supplier.id}`)).status).toBe(409)
    expect((await c.post(`/products/${product.id}/archive`)).body.data.status).toBe('ARCHIVED')
    const cust = await customer(c)
    expect((await c.post('/sales-orders', { customerId: cust.id, items: [{ productId: product.id, quantity: 1 }] })).status).toBe(422)
    expect((await c.post(`/products/${product.id}/adjust`, { quantity: -10, note: 'damaged' })).status).toBe(409)
  })
})
