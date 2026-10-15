import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Check } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { DEMO_HREF } from './demoHref'
import { Link } from 'react-router-dom'
import { StatusDot } from '../app/pages/Dashboard'
import RevenueChart from '../components/RevenueChart'
import { Arrow, Button, ButtonLink, CountUp, EASE, Logo, Reveal } from '../components/ui/primitives'
import { buildOverview, products } from '../demo/data'
import { count, inr, lakh, pct } from '../lib/format'
import type { OrderStatus, OverviewStockItem as StockItem, Range } from '../lib/types'

function Eyebrow({ n, children, tone = 'paper' }: { n: string; children: React.ReactNode; tone?: 'paper' | 'ink' }) {
  return (
    <div className={`label flex items-center gap-3 ${tone === 'ink' ? 'text-ink-400' : 'text-stone-600'}`}>
      <span className={tone === 'ink' ? 'text-lime' : 'text-ink-950'}>{n}</span>
      <span className={`h-px w-10 ${tone === 'ink' ? 'bg-ink-700' : 'bg-paper-300'}`} />
      {children}
    </div>
  )
}

/* ——— Principles strip ——— */
export function Principles() {
  const items = [
    ['0', 'stock changes outside a database transaction'],
    ['7', 'typed, read-only tools the assistant may call'],
    ['3', 'roles, enforced on the server, not the screen'],
    ['1', 'definition for every metric on every chart'],
  ]
  return (
    <section aria-label="Principles" className="border-b border-paper-300 bg-paper-50">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-4">
        {items.map(([n, t], i) => (
          <Reveal key={n + t} delay={i * 0.07} className="border-paper-300 px-5 py-10 md:px-10 [&:not(:last-child)]:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
            <div className="font-serif text-[clamp(64px,7vw,104px)] leading-[0.8]">{n}</div>
            <p className="mt-4 max-w-[220px] text-[14px] leading-snug text-stone-600">{t}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ——— Inventory ——— */
function movementsFor(p: StockItem) {
  const sold = [Math.round(p.dailySales * 6), Math.round(p.dailySales * 5), Math.round(p.dailySales * 4)].map((x) => Math.max(1, x))
  const soldSum = sold.reduce((s, v) => s + v, 0)
  const opening = Math.max(soldSum, Math.round(p.reorderAt * 0.9))
  const received = p.onHand + soldSum - opening
  const rows = [
    { d: '28 Sep', ref: 'Opening', qty: null as number | null, bal: opening },
    { d: '30 Sep', ref: 'SO-0377', qty: -sold[0], bal: 0 },
    { d: '03 Oct', ref: 'PO-0088 received', qty: received, bal: 0 },
    { d: '08 Oct', ref: 'SO-0396', qty: -sold[1], bal: 0 },
    { d: '13 Oct', ref: 'SO-0411', qty: -sold[2], bal: 0 },
  ]
  let b = opening
  rows.slice(1).forEach((r) => { b += r.qty ?? 0; r.bal = b })
  return received > 0 ? rows : rows.filter((r) => r.ref !== 'PO-0088 received')
}

export function InventorySection() {
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [focus, setFocus] = useState<StockItem>(products.find((p) => p.state === 'low')!)
  const counts = { all: products.length, low: products.filter((p) => p.state === 'low').length, out: products.filter((p) => p.state === 'out').length }
  const moves = useMemo(() => movementsFor(focus), [focus])

  return (
    <section id="inventory" className="scroll-mt-16 bg-paper-50">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-24 md:grid-cols-12 md:px-10 md:py-36">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-28">
            <Reveal><Eyebrow n="01">Inventory</Eyebrow></Reveal>
            <Reveal delay={0.05}><h2 className="mt-6 text-[clamp(44px,5.6vw,84px)] font-semibold leading-[0.92] tracking-[-0.05em]">Stock that <span className="font-serif font-normal italic">explains</span> itself.</h2></Reveal>
            <Reveal delay={0.1}><p className="mt-6 max-w-md text-[17px] leading-[1.6] text-stone-600">Every unit has a history. Opervia records each receipt, sale, cancellation and adjustment as a movement, so the number on hand always reconciles with what happened.</p></Reveal>
            <Reveal delay={0.15}>
              <ul className="mt-8 space-y-3 text-[15px]">
                {['Reorder points per product, with days of cover from real sell-through', 'Archive instead of delete when history depends on it', 'Server-side search, filters and pagination'].map((t) => (
                  <li key={t} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t}</li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>

        <Reveal className="md:col-span-7" delay={0.1}>
          <div className="border-t border-ink-950">
            <div className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="label text-stone-600">48 products · Rao Electricals · hover or tab through</div>
              <div role="tablist" aria-label="Filter" className="flex gap-1 rounded-full border border-paper-300 p-0.5">
                {(['all', 'low', 'out'] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`relative h-8 rounded-full px-3.5 text-[12.5px] capitalize transition-colors ${filter === f ? 'text-paper-50' : 'text-stone-600 hover:text-ink-950'}`}>
                    {filter === f && <motion.span layoutId="inv-filter" className="absolute inset-0 -z-0 rounded-full bg-ink-950" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative">{f} <span className="tnum opacity-60">{counts[f]}</span></span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {products.map((p, i) => {
                const dim = filter !== 'all' && p.state !== filter
                const active = focus.id === p.id
                return (
                  <motion.button key={p.id} onMouseEnter={() => setFocus(p)} onFocus={() => setFocus(p)} onClick={() => setFocus(p)} aria-label={`${p.name}, ${p.onHand} on hand`} aria-pressed={active}
                    initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: dim ? 0.12 : 1, scale: 1 }} animate={{ opacity: dim ? 0.12 : 1 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.008, duration: 0.4, ease: EASE }}
                    className={`relative aspect-square transition-shadow ${active ? 'shadow-[0_0_0_2px_#F7F5F0,0_0_0_4px_#0B0C0E]' : ''} ${p.state === 'ok' ? 'bg-ink-950' : p.state === 'low' ? 'bg-lime ring-1 ring-inset ring-ink-950' : 'hatch text-ink-950 ring-1 ring-inset ring-ink-950'}`} />
                )
              })}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={focus.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: EASE }} className="mt-6 grid gap-6 border-t border-ink-950 pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <div>
                  <div className="label text-stone-600">{focus.sku} · {focus.category}</div>
                  <div className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em]">{focus.name}</div>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="font-serif text-[64px] leading-[0.8]">{focus.onHand}</span>
                    <span className="mb-1 text-[13px] text-stone-600">on hand · reorder at {focus.reorderAt}</span>
                  </div>
                  <div className="mt-3 text-[13px]">{focus.state === 'out' ? 'Out of stock — open orders are waiting.' : focus.state === 'low' ? `Below reorder · about ${Math.max(1, Math.round(focus.onHand / focus.dailySales))} days of cover left.` : `Healthy · about ${Math.round(focus.onHand / focus.dailySales)} days of cover.`}</div>
                </div>
                <div>
                  <div className="label flex justify-between border-b border-paper-300 pb-2 text-stone-600"><span>Movement ledger</span><span>Balance</span></div>
                  {moves.map((m, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="grid grid-cols-[52px_minmax(0,1fr)_52px_44px] gap-2 border-b border-paper-200 py-2 font-mono text-[12px]">
                      <span className="text-stone-500">{m.d}</span>
                      <span className="truncate font-sans text-[13px]">{m.ref}</span>
                      <span className={`tnum text-right ${m.qty && m.qty > 0 ? 'text-ink-950' : 'text-stone-600'}`}>{m.qty == null ? '' : m.qty > 0 ? `+${m.qty}` : `−${Math.abs(m.qty)}`}</span>
                      <span className="tnum text-right">{m.bal}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ——— Workflow ——— */
const LINES = [
  { p: products[21], qty: 24 }, { p: products[29], qty: 60 }, { p: products[1], qty: 6 },
]
const TAX = 0.18

export function WorkflowSection() {
  const [step, setStep] = useState(0) // 0 draft, 1 confirmed, 2 completed+invoiced, 3 part paid, 4 paid
  const [flash, setFlash] = useState(0)
  const subtotal = LINES.reduce((s, l) => s + l.qty * l.p.price, 0)
  const tax = Math.round(subtotal * TAX)
  const total = subtotal + tax
  const first = Math.round(total * 0.6 / 1000) * 1000
  const paid = step >= 4 ? total : step >= 3 ? first : 0
  const status: OrderStatus = step === 0 ? 'DRAFT' : step === 1 ? 'CONFIRMED' : 'COMPLETED'
  const actions = ['Confirm order', 'Complete and invoice', `Record payment of ${inr(first)}`, `Record balance of ${inr(total - first)}`, 'Run it again']
  const advance = () => { setStep((s) => (s >= 4 ? 0 : s + 1)); setFlash((f) => f + 1) }
  const STATES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']

  return (
    <section id="workflow" className="scroll-mt-16 border-t border-paper-300 bg-paper-100">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-36">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Reveal><Eyebrow n="02">Orders, stock and invoices</Eyebrow></Reveal>
            <Reveal delay={0.05}><h2 className="mt-6 text-[clamp(44px,5.6vw,84px)] font-semibold leading-[0.92] tracking-[-0.05em]">One order. <span className="font-serif font-normal italic">Every</span> consequence.</h2></Reveal>
          </div>
          <Reveal delay={0.1} className="md:col-span-4 md:col-start-9">
            <p className="text-[16px] leading-[1.6] text-stone-600">Press the button and follow the order through. Stock is reserved inside the same transaction that confirms it; the invoice copies line prices so later price changes never rewrite history.</p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="mt-14">
          <div className="flex flex-wrap items-center gap-2 border-y border-ink-950 py-3 font-mono text-[11px] tracking-[0.06em]" aria-label="Order state machine">
            {STATES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className={`relative rounded-full px-2.5 py-1 transition-colors ${status === s ? 'text-ink-950' : s === 'CANCELLED' ? 'text-stone-500 line-through' : 'text-stone-500'}`}>
                  {status === s && <motion.span layoutId="state-pill" className="absolute inset-0 rounded-full bg-lime ring-1 ring-ink-950" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="relative">{s}</span>
                </span>
                {i < 3 && <span className="text-stone-500">→</span>}
                {i === 3 && <span className="ml-3 text-stone-500">· cancel from DRAFT / CONFIRMED restores stock once</span>}
              </span>
            ))}
          </div>

          <div className="grid border-b border-ink-950 md:grid-cols-3 md:divide-x md:divide-paper-300">
            <div className="py-7 md:pr-8">
              <div className="flex items-baseline justify-between"><span className="label text-stone-600">Sales order</span><span className="font-mono text-[12px]">SO-0419</span></div>
              <div className="mt-3 text-[20px] font-medium tracking-[-0.02em]">Riverside Apartments CHS</div>
              <div className="mt-2"><StatusDot status={status} /></div>
              <div className="mt-5 border-t border-paper-300">
                {LINES.map((l) => (
                  <div key={l.p.id} className="grid grid-cols-[minmax(0,1fr)_44px_84px] gap-2 border-b border-paper-200 py-2.5 text-[13px]">
                    <span className="truncate">{l.p.name}</span><span className="tnum text-right font-mono text-stone-600">×{l.qty}</span><span className="tnum text-right font-mono">{inr(l.qty * l.p.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-[13px] text-stone-600"><span>GST 18% · demo setting</span><span className="tnum font-mono">{inr(tax)}</span></div>
                <div className="flex justify-between py-1 text-[15px] font-medium"><span>Total</span><span className="tnum font-mono">{inr(total)}</span></div>
              </div>
            </div>

            <div className="border-t border-paper-300 py-7 md:border-t-0 md:px-8">
              <div className="label text-stone-600">Stock on hand</div>
              <div className="mt-4 space-y-4">
                {LINES.map((l) => {
                  const after = step >= 1 ? l.p.onHand - l.qty : l.p.onHand
                  return (
                    <div key={l.p.id}>
                      <div className="flex items-baseline justify-between text-[13px]"><span className="truncate pr-3">{l.p.name}</span>
                        <motion.span key={`${l.p.id}-${step >= 1}`} initial={{ backgroundColor: step === 1 ? '#CDF545' : 'rgba(0,0,0,0)' }} animate={{ backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 1.2 }} className="tnum px-1 font-serif text-[26px] leading-none">{after}</motion.span>
                      </div>
                      <AnimatePresence>
                        {step >= 1 && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden font-mono text-[11px] text-stone-600">
                            −{l.qty} · reserved for SO-0419 · movement recorded
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-paper-300 py-7 md:border-t-0 md:pl-8">
              <div className="flex items-baseline justify-between"><span className="label text-stone-600">Invoice</span>{step >= 2 && <span className="font-mono text-[12px]">INV-0312</span>}</div>
              <AnimatePresence mode="wait">
                {step < 2 ? (
                  <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 text-[14px] text-stone-500">Issued when the order is completed, from the order’s own lines.</motion.p>
                ) : (
                  <motion.div key="inv" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE, duration: 0.45 }} className="mt-4">
                    <div className="label text-stone-600">Outstanding</div>
                    <CountUp value={total - paid} format={inr} className="mt-2 block font-serif text-[52px] leading-[0.85]" />
                    <div className="mt-4 h-[6px] bg-paper-200"><motion.div className="h-full bg-ink-950" animate={{ width: `${(paid / total) * 100}%` }} transition={{ duration: 0.7, ease: EASE }} /></div>
                    <div className="mt-2 flex justify-between font-mono text-[11.5px] text-stone-600"><span>Paid {inr(paid)}</span><span>{step >= 4 ? 'PAID' : step >= 3 ? 'PARTIALLY PAID' : 'UNPAID'}</span></div>
                    {step >= 4 && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-lime px-3 py-1 text-[12.5px] ring-1 ring-ink-950"><Check className="h-3.5 w-3.5" />Settled — overpayment is rejected</motion.div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={advance} key={flash}>{actions[step]} <Arrow /></Button>
            <span className="font-mono text-[12px] text-stone-600">Step {Math.min(step + 1, 5)} of 5 · simulated in your browser</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ——— Analytics ——— */
export function AnalyticsSection() {
  const [range, setRange] = useState<Range>('90d')
  const d = useMemo(() => buildOverview(range), [range])
  const defs = [
    ['Revenue', 'Confirmed and completed orders, after discount, before tax. Cancelled orders never count.'],
    ['Outstanding', 'Invoice totals minus recorded payments, per invoice, never below zero.'],
    ['Days of cover', 'Units on hand ÷ average daily units sold over the last 30 days.'],
    ['Inventory value', 'Units on hand × cost price at the time of the query.'],
  ]
  return (
    <section id="analytics" className="on-ink scroll-mt-16 bg-ink-950 text-paper-50">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-36">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-8">
            <Reveal><Eyebrow n="03" tone="ink">Analytics</Eyebrow></Reveal>
            <Reveal delay={0.05}><h2 className="mt-6 text-[clamp(44px,5.6vw,84px)] font-semibold leading-[0.92] tracking-[-0.05em]">Numbers with a <span className="font-serif font-normal italic text-lime">written definition.</span></h2></Reveal>
          </div>
        </div>
        <Reveal delay={0.1} className="mt-14 grid gap-10 border-t border-ink-700 pt-8 md:grid-cols-12">
          <div className="min-w-0 md:col-span-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="label text-ink-400">Net revenue · {d.period.label.toLowerCase()}</div>
                <div className="mt-3 flex items-end gap-4">
                  <CountUp value={d.revenue.total} format={lakh} className="font-serif text-[clamp(52px,6vw,88px)] leading-[0.82]" />
                  <span className="mb-1 font-mono text-[12px] text-lime">{pct(d.revenue.changePct)}</span>
                </div>
              </div>
              <div role="tablist" aria-label="Range" className="flex rounded-full border border-ink-700 p-0.5">
                {(['7d', '30d', '90d'] as Range[]).map((r) => (
                  <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={`relative h-8 rounded-full px-3.5 font-mono text-[11px] uppercase tracking-[0.06em] ${range === r ? 'text-ink-950' : 'text-ink-300 hover:text-paper-50'}`}>
                    {range === r && <motion.span layoutId="an-range" className="absolute inset-0 rounded-full bg-lime" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative">{r}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8"><RevenueChart tone="ink" rangeKey={range} dates={d.series.dates} current={d.series.current} previous={d.series.previous} height={340} peakLabel={`Strongest day · ${inr(d.revenue.peak.value)}`} /></div>
            <div className="mt-6 grid grid-cols-3 border-t border-ink-700">
              {d.ledger.slice(0, 3).map((m) => (
                <div key={m.key} className="border-r border-ink-800 py-4 pr-3 last:border-r-0 [&:not(:first-child)]:pl-4">
                  <div className="label text-ink-400">{m.label}</div>
                  <div className="tnum mt-2 font-serif text-[28px] leading-none">{m.format === 'inr' ? inr(m.value) : m.format === 'pct' ? `${m.value.toFixed(1)}%` : count(m.value)}</div>
                </div>
              ))}
            </div>
          </div>
          <dl className="md:col-span-4">
            {defs.map(([t, d2], i) => (
              <Reveal key={t} delay={0.1 + i * 0.06} className="border-b border-ink-800 py-5 first:pt-0">
                <dt className="text-[15px] font-medium">{t}</dt>
                <dd className="mt-2 text-[14px] leading-[1.55] text-ink-300">{d2}</dd>
              </Reveal>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}

/* ——— Assistant pipeline ——— */
const STEPS = [
  ['Question', 'An authenticated request reaches the server and is validated with Zod.'],
  ['Tool selection', 'The question maps to one of seven approved tools — never raw SQL.'],
  ['Permission check', 'Your role and a clamped date range are applied before any query runs.'],
  ['Parameterised query', 'Prisma runs a predefined aggregation; only the result leaves the database.'],
  ['Explanation', 'The model explains the validated numbers; its reply is checked against a schema.'],
]
export function AssistantSection() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 55%'] })
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1])
  const [active, setActive] = useState(reduce ? STEPS.length : 0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => { if (!reduce) setActive(Math.min(STEPS.length, Math.floor(v * STEPS.length + 0.2))) })

  return (
    <section id="assistant" className="scroll-mt-16 bg-paper-50">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-5 py-24 md:grid-cols-12 md:px-10 md:py-36">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-28">
            <Reveal><Eyebrow n="04">AI analyst</Eyebrow></Reveal>
            <Reveal delay={0.05}><h2 className="mt-6 text-[clamp(44px,5.6vw,84px)] font-semibold leading-[0.92] tracking-[-0.05em]">Ask your books. <span className="font-serif font-normal italic">Get receipts.</span></h2></Reveal>
            <Reveal delay={0.1}><p className="mt-6 max-w-md text-[17px] leading-[1.6] text-stone-600">Every answer names the tool it used, the parameters, and the time it took. If the AI provider is down, the rest of Opervia keeps working.</p></Reveal>
            <Reveal delay={0.15}><ButtonLink to="/app/assistant" variant="primary" size="lg" className="mt-8">Ask the demo workspace <Arrow /></ButtonLink></Reveal>
          </div>
        </div>
        <div ref={ref} className="relative md:col-span-6 md:col-start-7">
          <div className="absolute bottom-6 left-[15px] top-6 w-px bg-paper-300" aria-hidden="true" />
          <motion.div className="absolute left-[15px] top-6 w-px origin-top bg-ink-950" style={{ scaleY: fill, bottom: 24 }} aria-hidden="true" />
          <ol className="space-y-14">
            {STEPS.map(([t, body], i) => {
              const on = i < active
              return (
                <li key={t} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-6">
                  <motion.span animate={{ backgroundColor: on ? '#CDF545' : '#F7F5F0', scale: on ? 1 : 0.9 }} transition={{ duration: 0.3 }} className="relative z-10 grid h-8 w-8 place-items-center rounded-full font-mono text-[11px] ring-1 ring-ink-950">{String(i + 1).padStart(2, '0')}</motion.span>
                  <motion.div animate={{ opacity: on ? 1 : 0.35 }} transition={{ duration: 0.35 }}>
                    <h3 className="text-[26px] font-semibold tracking-[-0.03em]">{t}</h3>
                    <p className="mt-2 max-w-md text-[15px] leading-[1.6] text-stone-600">{body}</p>
                    {i === 1 && (
                      <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px]">
                        {['getRevenueSummary', 'getTopSellingProducts', 'getLowStockProducts', 'getPendingOrders', 'getOutstandingInvoices', 'compareRevenuePeriods', 'getInventoryValue'].map((x) => (
                          <span key={x} className="rounded-[3px] border border-paper-300 px-1.5 py-0.5">{x}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ——— Closing + footer ——— */
export function Closing() {
  return (
    <section className="relative overflow-hidden bg-lime text-ink-950">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="text-[clamp(52px,10vw,168px)] font-semibold leading-[0.86] tracking-[-0.06em]">
          {['Clear decisions', 'start with', 'clean books.'].map((l, i) => (
            <span key={l} className="block overflow-hidden pb-[0.05em]">
              <motion.span className={`block ${i === 2 ? 'font-serif font-normal italic tracking-[-0.03em]' : ''}`} initial={{ y: '105%' }} whileInView={{ y: 0 }} viewport={{ once: true, margin: '-15%' }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}>{l}</motion.span>
            </span>
          ))}
        </h2>
        <div className="mt-12 flex flex-wrap items-center gap-3 md:justify-end">
          <ButtonLink to={DEMO_HREF} size="lg">Open the demo workspace <Arrow /></ButtonLink>
          <ButtonLink to="/register" variant="secondary" size="lg">Create a workspace</ButtonLink>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const y = useTransform(scrollYProgress, [0, 1], ['40%', '0%'])
  const cols = [
    ['Product', [['Overview', '/app/dashboard'], ['Inventory', '/app/inventory'], ['Sales orders', '/app/orders'], ['Invoices', '/app/invoices'], ['Assistant', '/app/assistant']]],
    ['Account', [['Log in', '/login'], ['Create a workspace', '/register']]],
  ] as const
  return (
    <footer ref={ref} className="on-ink relative overflow-hidden bg-ink-950 text-paper-50">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-10 pt-20 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <Logo tone="paper" />
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-ink-300">Intelligent Operations. Clear Decisions. A portfolio project by Sarvesh — React, Express, Prisma and PostgreSQL.</p>
        </div>
        {cols.map(([h, links]) => (
          <nav key={h} aria-label={h} className="md:col-span-2">
            <div className="label text-ink-400">{h}</div>
            <ul className="mt-4 space-y-2.5 text-[14px]">{links.map(([t, to]) => <li key={t}><Link to={to} className="text-ink-300 transition-colors hover:text-paper-50">{t}</Link></li>)}</ul>
          </nav>
        ))}
        <div className="md:col-span-3">
          <div className="label text-ink-400">Source</div>
          <a href="https://github.com/sarvesh1587" className="mt-4 inline-block text-[14px] text-ink-300 link-underline hover:text-paper-50">github.com/sarvesh1587</a>
        </div>
      </div>
      <motion.div style={{ y }} aria-hidden="true" className="pointer-events-none select-none px-3 text-[clamp(120px,27vw,420px)] font-semibold leading-[0.72] tracking-[-0.075em] text-ink-850">opervia</motion.div>
      <div className="label relative border-t border-ink-800 bg-ink-950"><div className="mx-auto flex max-w-[1440px] justify-between px-5 py-4 text-ink-400 md:px-10"><span>© 2026 Opervia</span><span>Demo data is fictional</span></div></div>
    </footer>
  )
}
