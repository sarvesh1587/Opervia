import type { NextFunction, Request, Response } from 'express'
import { z, type ZodType } from 'zod'

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType }

/** Parses and replaces req.body / req.query / req.params; failures become 400 responses with field errors. */
export const validate = (s: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  if (s.params) req.params = s.params.parse(req.params) as Request['params']
  if (s.query) Object.defineProperty(req, 'query', { value: s.query.parse(req.query), writable: true, configurable: true })
  if (s.body) req.body = s.body.parse(req.body ?? {})
  next()
}

export const idParam = z.object({ id: z.string().min(1).max(40) })
