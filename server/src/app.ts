import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { prisma } from './db.js'
import { logger } from './lib/logger.js'
import { requireAuth } from './middleware/auth.js'
import { csrfProtection } from './middleware/csrf.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { router as admin } from './modules/admin/routes.js'
import { router as analytics } from './modules/analytics/routes.js'
import { router as assistant } from './modules/assistant/routes.js'
import { router as auth } from './modules/auth/routes.js'
import { router as customers } from './modules/customers/routes.js'
import { router as invoices } from './modules/invoices/routes.js'
import { router as products } from './modules/products/routes.js'
import { router as purchaseOrders } from './modules/purchaseOrders/routes.js'
import { router as salesOrders } from './modules/salesOrders/routes.js'
import { router as suppliers } from './modules/suppliers/routes.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  if (env.TRUST_PROXY) app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  if (env.logRequests) {
    app.use((req, res, next) => {
      const t0 = performance.now()
      // Paths and status only: no bodies, cookies or query strings, which may hold personal data.
      res.on('finish', () => logger.info('request', { method: req.method, path: req.baseUrl + req.path, status: res.statusCode, ms: Math.round(performance.now() - t0), user: req.auth?.userId }))
      next()
    })
  }

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok', database: 'up', ai: env.aiConfigured ? 'configured' : 'not_configured', time: new Date().toISOString() })
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' })
    }
  })

  const api = express.Router()
  api.use(csrfProtection)
  api.use('/auth', auth)
  api.use(requireAuth)
  api.use('/products', products)
  api.use('/suppliers', suppliers)
  api.use('/customers', customers)
  api.use('/purchase-orders', purchaseOrders)
  api.use('/sales-orders', salesOrders)
  api.use('/invoices', invoices)
  api.use('/analytics', analytics)
  api.use('/assistant', assistant)
  api.use('/', admin)
  app.use('/api', api)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
