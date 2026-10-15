import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { ok } from '../../lib/http.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { ask } from './service.js'
import { toolsFor } from './tools.js'

export const router = Router()

const limiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 1000 : 20,
  keyGenerator: (req) => req.auth?.userId ?? 'anonymous',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many questions in a minute. Wait a moment and ask again.' },
})

router.get('/status', requirePermission('assistant:use'), (req, res) => {
  ok(res, { configured: env.aiConfigured, model: env.aiConfigured ? env.AI_MODEL : null, tools: toolsFor(ctx(req)).map((t) => ({ name: t.name, description: t.description })) })
})

router.post('/ask', requirePermission('assistant:use'), limiter, validate({ body: z.object({ question: z.string().trim().min(3, 'Ask a full question').max(500) }) }), async (req, res) => {
  ok(res, await ask(ctx(req), req.body.question))
})
