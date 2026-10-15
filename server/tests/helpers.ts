import request from 'supertest'
import { createApp } from '../src/app.js'

export const app = createApp()

/** A signed-in browser: keeps cookies and sends the CSRF header on every request. */
export class Client {
  agent = request.agent(app)
  csrf = ''
  async init() {
    const r = await this.agent.get('/api/auth/csrf')
    this.csrf = r.body.data.csrfToken
    return this
  }
  get(path: string) { return this.agent.get(`/api${path}`) }
  post(path: string, body: object = {}, headers: Record<string, string> = {}) { return this.agent.post(`/api${path}`).set('X-CSRF-Token', this.csrf).set(headers).send(body) }
  put(path: string, body: object) { return this.agent.put(`/api${path}`).set('X-CSRF-Token', this.csrf).send(body) }
  patch(path: string, body: object) { return this.agent.patch(`/api${path}`).set('X-CSRF-Token', this.csrf).send(body) }
  del(path: string) { return this.agent.delete(`/api${path}`).set('X-CSRF-Token', this.csrf) }
}

let n = 0
export async function newWorkspace(prefix = 'biz') {
  const c = await new Client().init()
  const email = `${prefix}${++n}${Date.now()}@example.com`
  const r = await c.post('/auth/register', { name: 'Owner Person', business: `${prefix} ${n} Traders`, email, password: 'Passw0rdX' })
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`)
  return { c, email }
}

export async function login(email: string, password: string) {
  const c = await new Client().init()
  const r = await c.post('/auth/login', { email, password })
  if (r.status !== 200) throw new Error(`login failed: ${r.status}`)
  return c
}

/** Supplier + product with stock, received through a real purchase order. */
export async function stockedProduct(c: Client, qty: number, opts: { cost?: number; price?: number; reorder?: number; sku?: string } = {}) {
  const s = (await c.post('/suppliers', { name: `Supplier ${Math.random().toString(36).slice(2, 8)}`, email: 'sup@example.com' })).body.data
  const p = (await c.post('/products', { sku: opts.sku ?? `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, name: 'Widget', costPrice: opts.cost ?? 100, sellingPrice: opts.price ?? 150, reorderLevel: opts.reorder ?? 2, supplierId: s.id })).body.data
  if (qty > 0) {
    const po = (await c.post('/purchase-orders', { supplierId: s.id, items: [{ productId: p.id, quantity: qty, unitCost: opts.cost ?? 100 }] })).body.data
    await c.post(`/purchase-orders/${po.id}/submit`)
    await c.post(`/purchase-orders/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: qty }] })
  }
  return { supplier: s, product: p }
}

export async function customer(c: Client) {
  return (await c.post('/customers', { name: `Customer ${Math.random().toString(36).slice(2, 8)}` })).body.data
}
