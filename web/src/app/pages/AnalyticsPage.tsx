import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, Figures, Input, PageHeader, useListParams } from '../../components/ui/kit'
import { EASE, Skeleton } from '../../components/ui/primitives'
import { useList } from '../../hooks/data'
import { qs } from '../../lib/api'
import { count, inr, lakh, pct, shortDate } from '../../lib/format'
import type { Report } from '../../lib/types'
import { RequirePermission } from '../auth'

const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
const minus = (d: string, n: number) => new Date(Date.parse(d) - n * 86_400_000).toISOString().slice(0, 10)
function presets() {
  const t = today(), [y, m] = t.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const lastEnd = minus(first, 1)
  return [
    { id: '30d', label: 'Last 30 days', from: minus(t, 29), to: t },
    { id: '90d', label: 'Last 90 days', from: minus(t, 89), to: t },
    { id: 'month', label: 'This month', from: first, to: t },
    { id: 'lastmonth', label: 'Last month', from: lastEnd.slice(0, 8) + '01', to: lastEnd },
    { id: '180d', label: 'Last 6 months', from: minus(t, 179), to: t },
  ]
}
const change = (a: number, b: number) => (b ? pct((a / b - 1) * 100) : '—')
const axis = { fontSize: 10, fontFamily: 'Geist Mono Variable', fill: '#77736A' }
const short = (v: number) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L` : v >= 1e3 ? `₹${Math.round(v / 1e3)}K` : `₹${v}`)

function Body() {
  const P = useMemo(presets, [])
  const { values: f, set } = useListParams({ from: P[0].from, to: P[0].to })
  const q = useList<Report>(['report', f.from, f.to], `/analytics/report${qs({ from: f.from, to: f.to })}`)
  const active = P.find((p) => p.from === f.from && p.to === f.to)?.id
  const r = q.data

  return (
    <div>
      <PageHeader eyebrow="Analytics" title={<>The numbers, <span className="font-serif font-normal italic">defined.</span></>}>
        Every figure is a SQL aggregate over confirmed, processing and completed orders. Cancelled orders and drafts never count.
      </PageHeader>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-300 px-4 py-5 md:px-7">
        <div role="group" aria-label="Date range presets" className="flex flex-wrap gap-1 rounded-full border border-paper-300 p-0.5">
          {P.map((p) => (
            <button key={p.id} onClick={() => set({ from: p.from, to: p.to })} aria-pressed={active === p.id} className={`relative h-8 rounded-full px-3.5 text-[12.5px] transition-colors ${active === p.id ? 'text-paper-50' : 'text-stone-600 hover:text-ink-950'}`}>
              {active === p.id && <motion.span layoutId="range-preset" className="absolute inset-0 rounded-full bg-ink-950" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{p.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div><label htmlFor="a-from" className="label text-stone-600">From</label><Input id="a-from" type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="mt-1.5 h-9 w-[150px] text-[13px]" /></div>
          <div><label htmlFor="a-to" className="label text-stone-600">To</label><Input id="a-to" type="date" value={f.to} min={f.from} max={today()} onChange={(e) => e.target.value && set({ to: e.target.value })} className="mt-1.5 h-9 w-[150px] text-[13px]" /></div>
        </div>
      </div>

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r ? (
        <div className="space-y-4 px-7 py-8"><Skeleton className="h-20 w-full" /><Skeleton className="h-[320px] w-full" /></div>
      ) : (
        <div className={`transition-opacity ${q.isFetching ? 'opacity-60' : ''}`}>
          <Figures items={[
            { label: 'Revenue', value: lakh(r.summary.revenue), note: `${change(r.summary.revenue, r.previous.revenue)} vs previous ${r.range.days} days`, accent: true },
            { label: 'Orders', value: count(r.summary.orders), note: change(r.summary.orders, r.previous.orders) },
            { label: 'Average order', value: inr(r.summary.aov), note: change(r.summary.aov, r.previous.aov) },
            { label: 'Gross margin', value: `${r.summary.margin.toFixed(1)}%`, note: `${(r.summary.margin - r.previous.margin >= 0 ? '+' : '−') + Math.abs(r.summary.margin - r.previous.margin).toFixed(1)} pts` },
            { label: 'Gross profit', value: lakh(r.summary.grossProfit), note: `${count(r.summary.unitsSold)} units sold` },
          ]} />

          <section aria-labelledby="svp" className="px-4 py-8 md:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="svp" className="font-serif text-[28px] leading-none">Sales against purchases</h2>
              <div className="flex gap-5 font-mono text-[11px] text-stone-600"><span className="inline-flex items-center gap-2"><span className="h-3 w-2.5 bg-ink-950" />Revenue</span><span className="inline-flex items-center gap-2"><span className="h-3 w-2.5 bg-[#C9C2B4]" />Purchases ordered</span><span>per {r.range.interval}</span></div>
            </div>
            <div className="mt-6 h-[320px]" role="img" aria-label={`Revenue and purchases per ${r.range.interval} from ${f.from} to ${f.to}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E6E0D4" />
                  <XAxis dataKey="date" tickFormatter={(d) => shortDate(d)} tick={axis} axisLine={{ stroke: '#0B0C0E' }} tickLine={false} minTickGap={28} />
                  <YAxis tickFormatter={short} tick={axis} axisLine={false} tickLine={false} width={52} tickCount={5} />
                  <Tooltip cursor={{ fill: 'rgba(205,245,69,0.25)' }} contentStyle={{ background: '#0B0C0E', border: 0, borderRadius: 6, color: '#F7F5F0', fontSize: 12 }} labelFormatter={(d) => shortDate(String(d))}
                    formatter={(v, n) => [inr(Number(v)), n === 'revenue' ? 'Revenue' : 'Purchases']} />
                  <Bar dataKey="revenue" fill="#0B0C0E" radius={[2, 2, 0, 0]} maxBarSize={22} animationDuration={800} />
                  <Bar dataKey="purchases" fill="#C9C2B4" radius={[2, 2, 0, 0]} maxBarSize={22} animationDuration={900} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] border-t border-paper-300 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section aria-labelledby="top" className="min-w-0 border-paper-300 px-4 py-8 md:px-7 lg:border-r">
              <h2 id="top" className="font-serif text-[28px] leading-none">Top products</h2>
              <ol className="mt-6 border-t border-ink-950">
                {r.topProducts.map((p, i) => {
                  const w = (p.revenue / (r.topProducts[0]?.revenue || 1)) * 100
                  return (
                    <li key={p.id} className="border-b border-paper-200 py-3">
                      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <Link to={`/app/inventory/${p.id}`} className="min-w-0 truncate hover:underline"><span className="mr-3 font-mono text-[11px] text-stone-500">{String(i + 1).padStart(2, '0')}</span>{p.name}</Link>
                        <span className="tnum shrink-0 font-mono text-[12.5px]">{inr(p.revenue)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="relative block h-[6px] flex-1 bg-paper-200"><motion.span className={`absolute inset-y-0 left-0 ${i === 0 ? 'bg-lime ring-1 ring-inset ring-ink-950' : 'bg-ink-950'}`} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.8, delay: i * 0.04, ease: EASE }} /></span>
                        <span className="tnum w-52 shrink-0 text-right font-mono text-[11px] text-stone-500">{count(p.quantity)} units · {inr(p.profit)} profit</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
              {!r.topProducts.length && <p className="py-6 text-stone-500">No sales in this range.</p>}
            </section>
            <div className="min-w-0">
              <section aria-labelledby="cat" className="px-4 py-8 md:px-7">
                <h2 id="cat" className="font-serif text-[28px] leading-none">By category</h2>
                <div className="mt-6 flex h-10 w-full overflow-hidden ring-1 ring-ink-950" role="img" aria-label="Revenue share by category">
                  {r.categories.map((c, i) => (
                    <motion.div key={c.category} title={`${c.category}: ${inr(c.revenue)}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: c.revenue }} transition={{ duration: 0.8, ease: EASE }}
                      className={`basis-0 border-r border-ink-950 last:border-r-0 ${['bg-ink-950', 'bg-lime', 'bg-stone-500', 'bg-paper-300', 'hatch bg-paper-50 text-ink-950', 'bg-ink-700', 'bg-paper-100', 'bg-stone-800'][i % 8]}`} />
                  ))}
                </div>
                <ul className="mt-4 space-y-1.5 text-[13px]">
                  {r.categories.map((c, i) => {
                    const total = r.categories.reduce((s, x) => s + x.revenue, 0) || 1
                    return (
                      <li key={c.category} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2"><span className={`inline-block h-2.5 w-2.5 ring-1 ring-ink-950 ${['bg-ink-950', 'bg-lime', 'bg-stone-500', 'bg-paper-300', 'hatch bg-paper-50 text-ink-950', 'bg-ink-700', 'bg-paper-100', 'bg-stone-800'][i % 8]}`} />{c.category}</span>
                        <span className="tnum font-mono text-[12px] text-stone-600">{((c.revenue / total) * 100).toFixed(1)}% · {lakh(c.revenue)}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
              <section aria-labelledby="cust" className="border-t border-paper-300 px-4 py-8 md:px-7">
                <h2 id="cust" className="font-serif text-[28px] leading-none">Top customers</h2>
                <ol className="mt-6 border-t border-ink-950">
                  {r.topCustomers.map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between gap-3 border-b border-paper-200 py-2.5 text-[13.5px]">
                      <Link to={`/app/customers/${c.id}`} className="truncate hover:underline">{c.name}</Link>
                      <span className="tnum shrink-0 font-mono text-[12.5px]">{inr(c.revenue)} <span className="text-stone-500">· {c.orders}</span></span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>

          <section aria-label="Balances today" className="grid border-t border-ink-950 md:grid-cols-2">
            <div className="border-paper-300 px-4 py-6 md:border-r md:px-7"><div className="label text-stone-600">Receivables today</div><div className="tnum mt-2 font-serif text-[34px] leading-none">{inr(r.receivables.outstanding)}</div><div className="mt-2 font-mono text-[11px] text-stone-500">{inr(r.receivables.overdue)} overdue across {r.receivables.overdueCount} invoices · <Link to="/app/invoices?status=OVERDUE" className="link-underline">view</Link></div></div>
            <div className="px-4 py-6 md:px-7"><div className="label text-stone-600">Inventory today</div><div className="tnum mt-2 font-serif text-[34px] leading-none">{inr(r.inventory.atCost)}</div><div className="mt-2 font-mono text-[11px] text-stone-500">at cost · {inr(r.inventory.atRetail)} at selling price · {count(r.inventory.units)} units</div></div>
          </section>
          <p className="border-t border-paper-300 px-4 py-3 font-mono text-[11px] text-stone-500 md:px-7">Days are counted in India Standard Time. Previous period: {shortDate(r.previousRange.from)} – {shortDate(r.previousRange.to)}.</p>
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  return <RequirePermission permission="analytics:read"><Body /></RequirePermission>
}
