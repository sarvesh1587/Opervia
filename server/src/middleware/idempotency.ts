import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db.js'
import { badRequest } from '../lib/errors.js'

/**
 * Optional Idempotency-Key support for money and stock operations. A retried request with the same key
 * returns the stored response instead of applying the change twice.
 */
export async function idempotent(req: Request, res: Response, next: NextFunction) {
  const key = req.get('idempotency-key')
  if (!key || !req.auth) return next()
  if (key.length > 100) throw badRequest('Idempotency-Key is too long.')
  const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}:${JSON.stringify(req.params)}`
  const hit = await prisma.idempotencyKey.findUnique({ where: { businessId_key_route: { businessId: req.auth.businessId, key, route } } })
  if (hit) {
    res.setHeader('Idempotent-Replay', 'true')
    return res.status(hit.statusCode).json(hit.responseBody)
  }
  const json = res.json.bind(res)
  res.json = (body: unknown) => {
    if (res.statusCode < 300) {
      prisma.idempotencyKey.create({ data: { businessId: req.auth!.businessId, key, route, statusCode: res.statusCode, responseBody: body as object } }).catch(() => undefined)
    }
    return json(body)
  }
  next()
}
