import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db.js'
import { audit } from '../../lib/audit.js'
import { conflict, forbidden, notFound } from '../../lib/errors.js'
import { ok, page } from '../../lib/http.js'
import { pageQuery, skipTake } from '../../lib/pagination.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { idParam, validate } from '../../middleware/validate.js'
import { emailSchema, passwordSchema } from '../auth/routes.js'

export const router = Router()

const demoGuard = async (businessId: string) => {
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { isDemo: true } })
  if (b.isDemo) throw forbidden('This is disabled in the shared demo workspace.')
}

router.get('/settings', async (req, res) => {
  const c = ctx(req)
  ok(res, await prisma.business.findUniqueOrThrow({ where: { id: c.businessId }, select: { id: true, name: true, city: true, currency: true, taxRate: true, taxLabel: true, paymentTermsDays: true, isDemo: true } }))
})

router.patch('/settings', requirePermission('settings:write'), validate({ body: z.object({
  name: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().max(80).optional(),
  taxRate: z.coerce.number().min(0).max(40).optional(),
  taxLabel: z.string().trim().min(2).max(20).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).optional(),
}) }), async (req, res) => {
  const c = ctx(req)
  await demoGuard(c.businessId)
  const b = await prisma.$transaction(async (tx) => {
    const r = await tx.business.update({ where: { id: c.businessId }, data: req.body })
    await audit(tx, c, { action: 'settings.updated', entity: 'Business', entityId: r.id, summary: `Updated business settings (${Object.keys(req.body).join(', ')})` })
    return r
  })
  ok(res, b)
})

router.get('/users', requirePermission('users:manage'), async (req, res) => {
  const c = ctx(req)
  ok(res, await prisma.user.findMany({ where: { businessId: c.businessId }, orderBy: [{ role: 'asc' }, { name: 'asc' }], select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true } }))
})

router.post('/users', requirePermission('users:manage'), validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, role: z.enum(['ADMIN', 'MANAGER', 'STAFF']), password: passwordSchema }) }), async (req, res) => {
  const c = ctx(req)
  await demoGuard(c.businessId)
  if (await prisma.user.findUnique({ where: { email: req.body.email } })) throw conflict('An account with this email already exists.')
  const u = await prisma.$transaction(async (tx) => {
    const r = await tx.user.create({ data: { businessId: c.businessId, name: req.body.name, email: req.body.email, role: req.body.role, passwordHash: await bcrypt.hash(req.body.password, 12) }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } })
    await audit(tx, c, { action: 'user.created', entity: 'User', entityId: r.id, summary: `Added ${r.name} as ${r.role.toLowerCase()}` })
    return r
  })
  ok(res, u, 201)
})

router.patch('/users/:id', requirePermission('users:manage'), validate({ params: idParam, body: z.object({ role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(), active: z.boolean().optional() }) }), async (req, res) => {
  const c = ctx(req)
  await demoGuard(c.businessId)
  const target = await prisma.user.findFirst({ where: { id: req.params.id as string, businessId: c.businessId } })
  if (!target) throw notFound('User')
  if (target.id === c.userId) throw conflict('You cannot change your own role or deactivate yourself.')
  const losingAdmin = target.role === 'ADMIN' && ((req.body.role && req.body.role !== 'ADMIN') || req.body.active === false)
  if (losingAdmin && (await prisma.user.count({ where: { businessId: c.businessId, role: 'ADMIN', active: true } })) <= 1) throw conflict('A workspace needs at least one active admin.')
  const u = await prisma.$transaction(async (tx) => {
    // Bumping tokenVersion signs the user out everywhere so a role change takes effect immediately.
    const r = await tx.user.update({ where: { id: target.id }, data: { ...req.body, tokenVersion: { increment: 1 } }, select: { id: true, name: true, email: true, role: true, active: true } })
    await audit(tx, c, { action: 'user.updated', entity: 'User', entityId: r.id, summary: `Updated ${r.name}: ${[req.body.role && `role ${req.body.role.toLowerCase()}`, req.body.active === false && 'deactivated', req.body.active === true && 'reactivated'].filter(Boolean).join(', ')}` })
    return r
  })
  ok(res, u)
})

const auditQuery = z.object({ ...pageQuery, entity: z.string().max(40).optional() })
router.get('/audit', requirePermission('audit:read'), validate({ query: auditQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as unknown as z.infer<typeof auditQuery>
  const where = { businessId: c.businessId, ...(q.entity ? { entity: q.entity } : {}), ...(q.q ? { summary: { contains: q.q, mode: 'insensitive' as const } } : {}) }
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q.page, q.pageSize), include: { user: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ])
  ok(res, page(items, total, q.page, q.pageSize))
})
