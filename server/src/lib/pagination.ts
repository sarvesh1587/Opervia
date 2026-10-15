import { z } from 'zod'

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
}
export const skipTake = (page: number, pageSize: number) => ({ skip: (page - 1) * pageSize, take: pageSize })

export const money = z.coerce.number().finite().min(0).max(99_999_999.99).transform((n) => Math.round(n * 100) / 100)
export const qty = z.coerce.number().int().min(1).max(1_000_000)
export const optionalText = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null))
export const optionalEmail = z.string().trim().toLowerCase().max(160).optional().transform((v) => (v ? v : null)).pipe(z.string().email('Enter a valid email address').nullable())
export const gstin = z.string().trim().toUpperCase().optional().transform((v) => (v ? v : null)).pipe(z.string().regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN must be 15 characters').nullable())
