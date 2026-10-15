import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { Prisma } from '../generated/prisma/client.js'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, code: 'VALIDATION', message: 'Some fields are invalid.', errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) })
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, code: 'DUPLICATE', message: `A record with this ${(err.meta?.target as string[] | undefined)?.filter((f) => f !== 'businessId').join(', ') || 'value'} already exists.` })
    if (err.code === 'P2003') return res.status(409).json({ success: false, code: 'IN_USE', message: 'This record is referenced by other records and cannot be removed.' })
    if (err.code === 'P2025') return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Record not found.' })
  }
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, code: 'BAD_JSON', message: 'Request body is not valid JSON.' })
  }
  logger.error('unhandled_error', { path: req.path, method: req.method, error: err instanceof Error ? err.message : String(err), stack: env.isProd ? undefined : (err as Error)?.stack })
  res.status(500).json({ success: false, code: 'INTERNAL', message: 'Something went wrong on our side. Try again in a moment.' })
}
