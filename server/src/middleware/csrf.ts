import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

export const CSRF_COOKIE = 'opervia_csrf'
export const CSRF_HEADER = 'x-csrf-token'

export function issueCsrf(req: Request, res: Response) {
  const existing = req.cookies?.[CSRF_COOKIE]
  const token = typeof existing === 'string' && existing.length === 64 ? existing : randomBytes(32).toString('hex')
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: env.cookieSecure, sameSite: env.COOKIE_SAMESITE, maxAge: 7 * 86_400_000, path: '/' })
  return token
}

/** Double-submit check: the header must equal the CSRF cookie for every state-changing request. */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const cookie = req.cookies?.[CSRF_COOKIE]
  const header = req.get(CSRF_HEADER)
  if (typeof cookie !== 'string' || typeof header !== 'string' || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new AppError(403, 'CSRF', 'Security token missing or invalid. Refresh the page and try again.')
  }
  next()
}
