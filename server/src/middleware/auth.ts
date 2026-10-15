import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { prisma } from '../db.js'
import { can, type AuthContext, type Permission } from '../auth/permissions.js'
import { forbidden, unauthorized } from '../lib/errors.js'

export const SESSION_COOKIE = 'opervia_session'

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext }
}

interface TokenPayload { sub: string; bid: string; v: number }

export function issueSession(res: Response, user: { id: string; businessId: string; tokenVersion: number }) {
  const token = jwt.sign({ sub: user.id, bid: user.businessId, v: user.tokenVersion } satisfies TokenPayload, env.JWT_SECRET, { expiresIn: `${env.SESSION_TTL_HOURS}h`, algorithm: 'HS256' })
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: env.cookieSecure, sameSite: env.COOKIE_SAMESITE, maxAge: env.SESSION_TTL_HOURS * 3_600_000, path: '/' })
}

export const clearSession = (res: Response) => res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: env.COOKIE_SAMESITE, path: '/' })

/** Verifies the session cookie and reloads the user so revoked or deactivated accounts lose access immediately. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (!token) throw unauthorized()
  let payload: TokenPayload
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload
  } catch (e) {
    clearSession(res)
    throw unauthorized(e instanceof jwt.TokenExpiredError ? 'Your session has expired. Sign in again.' : 'Sign in to continue.')
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, businessId: true, role: true, name: true, email: true, active: true, tokenVersion: true } })
  if (!user || !user.active || user.tokenVersion !== payload.v || user.businessId !== payload.bid) {
    clearSession(res)
    throw unauthorized('Your session is no longer valid. Sign in again.')
  }
  req.auth = { userId: user.id, businessId: user.businessId, role: user.role, name: user.name, email: user.email }
  next()
}

export const requirePermission = (p: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw unauthorized()
  if (!can(req.auth.role, p)) throw forbidden()
  next()
}

export const ctx = (req: Request): AuthContext => {
  if (!req.auth) throw unauthorized()
  return req.auth
}
