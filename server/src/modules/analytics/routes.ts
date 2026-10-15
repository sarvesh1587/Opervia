import { Router } from 'express'
import { z } from 'zod'
import { badRequest } from '../../lib/errors.js'
import { ok } from '../../lib/http.js'
import { ctx, requirePermission } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { addDays, categoryBreakdown, daysBetween, inventoryValue, MAX_RANGE_DAYS, overview, receivables, revenueSeries, revenueSummary, todayLocal, topCustomers, topProducts } from './service.js'

export const router = Router()

router.get('/overview', validate({ query: z.object({ range: z.enum(['7d', '30d', '90d']).default('30d') }) }), async (req, res) => {
  ok(res, await overview(ctx(req), (req.query as { range: '7d' | '30d' | '90d' }).range))
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const reportQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() })

/** Full analytics report for a date range; the previous period of equal length is returned for comparison. */
router.get('/report', requirePermission('analytics:read'), validate({ query: reportQuery }), async (req, res) => {
  const c = ctx(req)
  const q = req.query as z.infer<typeof reportQuery>
  const to = q.to ?? todayLocal()
  const from = q.from ?? addDays(to, -29)
  const days = daysBetween(from, to)
  if (days < 1) throw badRequest('The start date must be on or before the end date.')
  if (days > MAX_RANGE_DAYS) throw badRequest(`Choose a range of ${MAX_RANGE_DAYS} days or fewer.`)
  const pTo = addDays(from, -1), pFrom = addDays(pTo, -(days - 1))
  const interval = days > 180 ? 'month' : days > 45 ? 'week' : 'day'
  const [summary, previous, series, products, customers, categories, recv, inv] = await Promise.all([
    revenueSummary(c.businessId, from, to), revenueSummary(c.businessId, pFrom, pTo), revenueSeries(c.businessId, from, to, interval),
    topProducts(c.businessId, from, to, 10), topCustomers(c.businessId, from, to, 6), categoryBreakdown(c.businessId, from, to),
    receivables(c.businessId), inventoryValue(c.businessId),
  ])
  ok(res, { range: { from, to, days, interval }, previousRange: { from: pFrom, to: pTo }, summary, previous, series, topProducts: products, topCustomers: customers, categories, receivables: recv, inventory: inv })
})
