import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../db.js'
import { permissionsFor } from '../../auth/permissions.js'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js'
import { ok } from '../../lib/http.js'
import { clearSession, ctx, issueSession, requireAuth } from '../../middleware/auth.js'
import { issueCsrf } from '../../middleware/csrf.js'
import { validate } from '../../middleware/validate.js'

export const router = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Wait 15 minutes and try again.' },
})

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160)
const password = z.string().min(8, 'Use at least 8 characters').max(128).regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a number')
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 10)

const publicUser = (u: { id: string; name: string; email: string; role: string }) => ({ id: u.id, name: u.name, email: u.email, role: u.role })

router.get('/csrf', (req, res) => ok(res, { csrfToken: issueCsrf(req, res) }))

router.post('/register', authLimiter, validate({ body: z.object({ name: z.string().trim().min(2).max(80), business: z.string().trim().min(2).max(120), email, password }) }), async (req, res) => {
  const { name, business, email: em, password: pw } = req.body
  if (await prisma.user.findUnique({ where: { email: em } })) throw conflict('An account with this email already exists.')
  const passwordHash = await bcrypt.hash(pw, 12)
  const user = await prisma.$transaction(async (tx) => {
    const b = await tx.business.create({ data: { name: business } })
    const u = await tx.user.create({ data: { businessId: b.id, name, email: em, passwordHash, role: 'ADMIN' } })
    await audit(tx, { businessId: b.id, userId: u.id }, { action: 'workspace.created', entity: 'Business', entityId: b.id, summary: `Created workspace ${business}` })
    return u
  })
  issueSession(res, user)
  ok(res, { user: publicUser(user) }, 201)
})

router.post('/login', authLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }) }), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } })
  const valid = await bcrypt.compare(req.body.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) throw unauthorized('Email or password is incorrect.')
  if (!user.active) throw forbidden('This account has been deactivated. Ask your administrator.')
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  issueSession(res, user)
  ok(res, { user: publicUser(user) })
})

/** One-click access to the seeded demo workspace, in the role the visitor picks. Disabled unless DEMO_LOGIN_ENABLED=true. */
router.post('/demo', authLimiter, validate({ body: z.object({ role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('ADMIN') }) }), async (req, res) => {
  if (!env.DEMO_LOGIN_ENABLED) throw notFound('Demo access')
  const user = await prisma.user.findFirst({ where: { role: req.body.role, active: true, business: { isDemo: true } }, orderBy: { createdAt: 'asc' } })
  if (!user) throw notFound('Demo workspace (run the seed first)')
  issueSession(res, user)
  ok(res, { user: publicUser(user) })
})

router.post('/logout', (_req, res) => { clearSession(res); ok(res, { signedOut: true }) })

router.get('/me', requireAuth, async (req, res) => {
  const c = ctx(req)
  const business = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId }, select: { id: true, name: true, city: true, currency: true, taxRate: true, taxLabel: true, paymentTermsDays: true, isDemo: true } })
  ok(res, { user: { id: c.userId, name: c.name, email: c.email, role: c.role }, business, permissions: permissionsFor(c.role), ai: { configured: env.aiConfigured } })
})

router.post('/password', requireAuth, authLimiter, validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }), async (req, res) => {
  const c = ctx(req)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: c.userId }, include: { business: { select: { isDemo: true } } } })
  if (user.business.isDemo) throw forbidden('Passwords cannot be changed in the shared demo workspace.')
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect.')
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12), tokenVersion: { increment: 1 } } })
  issueSession(res, updated)
  ok(res, { changed: true })
})

export const passwordSchema = password
export const emailSchema = email
