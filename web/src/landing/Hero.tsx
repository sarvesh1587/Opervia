import { DEMO_HREF } from './demoHref'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Answer, AssistantMark } from '../app/AssistantPanel'
import RevenueChart from '../components/RevenueChart'
import { Arrow, ButtonLink, CountUp, EASE, Sparkline } from '../components/ui/primitives'
import { answerOffline, buildOverview } from '../demo/data'
import { formatMetric, inr, pct } from '../lib/format'
import type { AssistantAnswer } from '../lib/types'

const LINES = [
  <>Run the whole</>,
  <>business from one</>,
  <span className="font-serif font-normal italic tracking-[-0.02em] text-lime">honest ledger.</span>,
]

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 25%'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [16, 0])
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.93, 1])
  const blockY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [60, 0])

  return (
    <section id="product" className="on-ink relative overflow-hidden bg-[linear-gradient(to_bottom,var(--color-ink-950)_0%,var(--color-ink-950)_76%,var(--color-paper-50)_76%)] text-paper-50">
      <div className="hairline-grid pointer-events-none absolute inset-x-0 top-0 h-[76%] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1440px] px-5 pt-32 md:px-10 md:pt-40">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.1 }} className="label flex flex-wrap justify-between gap-3 text-ink-400">
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 bg-lime" />Inventory · Purchasing · Sales · Invoices · AI analyst</span>
          <span className="hidden sm:inline">Made for small and mid-sized businesses</span>
        </motion.div>

        <h1 className="mt-8 text-[clamp(40px,9vw,140px)] font-semibold leading-[0.9] tracking-[-0.058em]">
          {LINES.map((l, i) => (
            <span key={i} className="block overflow-hidden pb-[0.06em]">
              <motion.span className="block" initial={reduce ? false : { y: '105%' }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 + i * 0.09 }}>
                {l}
              </motion.span>
            </span>
          ))}
        </h1>

        <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-end">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7, ease: EASE }} className="text-[18px] leading-[1.55] text-ink-300 md:col-span-5">
            Opervia tracks every unit and every rupee — stock, purchase orders, sales and invoices — and lets you question it in plain English. Every answer comes from your records.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7, ease: EASE }} className="flex flex-wrap items-center gap-3 md:col-span-6 md:col-start-7 md:justify-end">
            <ButtonLink to={DEMO_HREF} variant="lime" size="lg">Open the demo workspace <Arrow /></ButtonLink>
            <ButtonLink to="/register" variant="inverse" size="lg">Create a workspace</ButtonLink>
          </motion.div>
        </div>

        <div ref={ref} className="relative mt-16 pb-20 md:mt-20 md:pb-28" style={{ perspective: 1600 }}>
          <motion.div aria-hidden="true" style={{ y: blockY }} className="absolute -right-3 bottom-[88px] top-24 hidden w-[42%] bg-lime md:block" />
          <motion.div style={{ rotateX, scale, transformOrigin: '50% 0%' }} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 1, ease: EASE }}>
            <Showcase />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

const TABS = [
  { id: 'overview', label: 'Overview', path: '/app/dashboard' },
  { id: 'stock', label: 'Stock', path: '/app/inventory?state=low' },
  { id: 'ask', label: 'Ask Opervia', path: '/app/assistant' },
] as const
type Tab = (typeof TABS)[number]['id']

function Showcase() {
  const [tab, setTab] = useState<Tab>('overview')
  const [auto, setAuto] = useState(true)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!auto || reduce) return
    const t = setTimeout(() => setTab((c) => TABS[(TABS.findIndex((x) => x.id === c) + 1) % TABS.length].id), 8000)
    return () => clearTimeout(t)
  }, [tab, auto, reduce])
  const current = TABS.find((t) => t.id === tab)!

  return (
    <div className="relative rounded-[14px] border border-ink-700 bg-ink-900 p-1.5 shadow-[0_60px_120px_-50px_rgb(0_0_0/0.8)]">
      <div className="flex flex-wrap items-center gap-3 px-2.5 pb-2 pt-1">
        <div className="flex gap-1.5" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-ink-700" />)}</div>
        <div className="hidden h-7 min-w-0 flex-1 items-center rounded-[6px] bg-ink-850 px-3 font-mono text-[11.5px] text-ink-400 sm:flex">
          opervia.app<AnimatePresence mode="wait"><motion.span key={current.path} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-ink-300">{current.path}</motion.span></AnimatePresence>
        </div>
        <div role="tablist" aria-label="Product preview" className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setAuto(false) }}
              className={`relative h-8 overflow-hidden rounded-[6px] px-3 text-[12.5px] transition-colors ${tab === t.id ? 'bg-ink-800 text-paper-50' : 'text-ink-400 hover:text-paper-50'}`}>
              {t.label}
              {tab === t.id && auto && !reduce && <motion.span key={tab} className="absolute bottom-0 left-0 h-[2px] bg-lime" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 8, ease: 'linear' }} />}
            </button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[9px] bg-paper-50 text-ink-950 md:h-[560px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} className="h-full" initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.4, ease: EASE }}>
            {tab === 'overview' ? <OverviewView /> : tab === 'stock' ? <StockView /> : <AskView />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="label flex justify-between px-2.5 pb-1 pt-2.5 text-ink-400">
        <span>Live components · demo workspace data</span>
        <span className="hidden sm:inline">Hover the chart</span>
      </div>
    </div>
  )
}

function OverviewView() {
  const d = useMemo(() => buildOverview('30d'), [])
  return (
    <div className="grid h-full md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 p-5 md:p-7">
        <div className="label text-stone-600">Net revenue · last 30 days</div>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
          <CountUp value={d.revenue.total} format={inr} className="font-serif text-[clamp(44px,6vw,76px)] leading-[0.86]" />
          <span className="mb-1.5 rounded-[3px] bg-lime px-1.5 py-0.5 font-mono text-[11.5px] ring-1 ring-ink-950">{pct(d.revenue.changePct)}</span>
        </div>
        <div className="mt-5">
          <RevenueChart rangeKey="hero" dates={d.series.dates} current={d.series.current} previous={d.series.previous} height={300} peakLabel={`Strongest day · ${inr(d.revenue.peak.value)}`} />
        </div>
      </div>
      <div className="hidden bg-ink-950 p-6 text-paper-50 md:block">
        <div className="label text-ink-400">Operating ledger</div>
        <ul className="mt-4 border-t border-ink-700">
          {d.ledger.slice(0, 5).map((m, i) => (
            <motion.li key={m.key} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.06, ease: EASE }} className={`relative flex items-center justify-between gap-3 border-b border-ink-800 py-3.5 pl-3 ${m.attention ? 'bg-ink-900' : ''}`}>
              {m.attention && <span className="absolute inset-y-0 left-0 w-[3px] bg-lime" />}
              <span>
                <span className="block text-[12px] text-ink-300">{m.label}</span>
                <span className="tnum mt-1 block font-serif text-[24px] leading-none">{formatMetric(m.value, m.format)}</span>
              </span>
              <Sparkline data={m.trend} stroke="#CDF545" width={60} />
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StockView() {
  const d = useMemo(() => buildOverview('30d'), [])
  const rows = d.stock.items.filter((p) => p.state !== 'ok').sort((a, b) => a.onHand / a.dailySales - b.onHand / b.dailySales)
  const extra = d.stock.items.filter((p) => p.state === 'ok').slice(0, 3)
  return (
    <div className="h-full p-5 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-950 pb-4">
        <div>
          <div className="label text-stone-600">Inventory · sorted by days of cover</div>
          <div className="mt-2 text-[clamp(28px,3.4vw,40px)] font-semibold leading-none tracking-[-0.04em]">{d.stock.low + d.stock.out} need attention <span className="font-serif font-normal italic text-stone-500">of {d.stock.items.length}</span></div>
        </div>
        <div className="flex gap-6 font-mono text-[12px]"><span><span className="mr-2 inline-block h-2 w-2 bg-lime ring-1 ring-ink-950" />{d.stock.low} low</span><span><span className="hatch mr-2 inline-block h-2 w-2 ring-1 ring-ink-950" />{d.stock.out} out</span></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead><tr className="label text-left text-stone-600">{['Product', 'Category', 'On hand vs reorder', 'Cover', 'Supplier'].map((h) => <th key={h} scope="col" className="py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {[...rows, ...extra].map((p, i) => {
              const f = Math.min(1, p.onHand / (p.reorderAt * 2))
              return (
                <motion.tr key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.045, ease: EASE }} className="border-t border-paper-200 hover:bg-paper-100">
                  <td className="py-2.5 pr-3"><span className="flex items-center gap-2.5"><span className={`h-2 w-2 shrink-0 ${p.state === 'ok' ? 'bg-ink-950' : p.state === 'low' ? 'bg-lime ring-1 ring-ink-950' : 'hatch ring-1 ring-ink-950'}`} />{p.name}</span></td>
                  <td className="py-2.5 text-stone-600">{p.category}</td>
                  <td className="w-[28%] py-2.5 pr-6">
                    <span className="relative block h-[5px] bg-paper-200">
                      <motion.span className="absolute inset-y-0 left-0 bg-ink-950" initial={{ width: 0 }} animate={{ width: `${Math.max(f * 100, 1)}%` }} transition={{ delay: 0.25 + i * 0.04, duration: 0.8, ease: EASE }} />
                      <span className="absolute -top-1 left-1/2 h-[13px] w-px bg-stone-500" />
                    </span>
                  </td>
                  <td className="tnum py-2.5 font-mono">{p.onHand === 0 ? 'out' : `${Math.max(1, Math.round(p.onHand / p.dailySales))} d`}</td>
                  <td className="py-2.5 text-stone-600">{(p as { supplier?: string }).supplier}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AskView() {
  const question = 'Which products need restocking?'
  const [typed, setTyped] = useState('')
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null)
  const [run, setRun] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    setTyped(''); setAnswer(null)
    if (reduce) { setTyped(question); setAnswer(answerOffline(question)); return }
    let i = 0
    const t = setInterval(() => {
      i++; setTyped(question.slice(0, i))
      if (i >= question.length) { clearInterval(t); setTimeout(() => setAnswer(answerOffline(question)), 700) }
    }, 38)
    return () => clearInterval(t)
  }, [run, reduce])
  return (
    <div className="on-ink flex h-full flex-col bg-ink-950 p-5 text-paper-50 md:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[13px]"><AssistantMark className="h-4 w-4" />Ask Opervia</div>
        <button onClick={() => setRun((r) => r + 1)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-paper-50"><RotateCcw className="h-3.5 w-3.5" />Replay</button>
      </div>
      <div className="mt-6 min-h-[1.2em] font-serif text-[clamp(26px,3vw,36px)] leading-tight">
        {typed}<span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] animate-pulse bg-lime align-baseline" />
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-hidden">
        {answer ? <Answer a={{ ...answer, table: answer.table && { ...answer.table, rows: answer.table.rows.slice(0, 5) } }} onAsk={() => setRun((r) => r + 1)} /> : typed.length === question.length && (
          <div className="flex items-center gap-3 font-mono text-[11.5px] text-ink-300">
            <span className="flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} className="h-1.5 w-1.5 bg-lime" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}</span>
            Routing to getLowStockProducts
          </div>
        )}
      </div>
    </div>
  )
}

