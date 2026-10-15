import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RevenueChart from '../../components/RevenueChart'
import { CountUp, EASE, Skeleton, Sparkline } from '../../components/ui/primitives'
import { useOverview } from '../../hooks/queries'
import { formatMetric, inr, pct, shortDate, time } from '../../lib/format'
import type { ActivityItem, OrderRow, OrderStatus, Overview, OverviewStockItem as StockItem, Range } from '../../lib/types'
import { Can } from '../auth'
import { AssistantMark } from '../AssistantPanel'
import { useAssistant } from '../AppShell'

const RANGES: { id: Range; label: string }[] = [{ id: '7d', label: '7D' }, { id: '30d', label: '30D' }, { id: '90d', label: '90D' }]

export function StatusDot({ status }: { status: OrderStatus }) {
  const cls: Record<OrderStatus, string> = {
    DRAFT: 'border border-dashed border-stone-500',
    CONFIRMED: 'border border-ink-950 bg-[linear-gradient(90deg,#0B0C0E_50%,transparent_50%)]',
    PROCESSING: 'border border-ink-950 bg-lime',
    COMPLETED: 'bg-ink-950',
    CANCELLED: 'border border-paper-300',
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${cls[status]}`} aria-hidden="true" />
      <span className={status === 'CANCELLED' ? 'text-stone-500 line-through' : status === 'DRAFT' ? 'text-stone-600' : ''}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>
    </span>
  )
}

function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="tablist" aria-label="Revenue period" className="relative flex rounded-full border border-paper-300 p-0.5">
      {RANGES.map((r) => (
        <button key={r.id} role="tab" aria-selected={value === r.id} onClick={() => onChange(r.id)}
          className={`relative z-10 h-7 rounded-full px-3 font-mono text-[11px] tracking-[0.06em] transition-colors ${value === r.id ? 'text-paper-50' : 'text-stone-600 hover:text-ink-950'}`}>
          {value === r.id && <motion.span layoutId="range-pill" className="absolute inset-0 -z-10 rounded-full bg-ink-950" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {r.label}
        </button>
      ))}
    </div>
  )
}

function Lead({ data, range, setRange, fetching }: { data: Overview; range: Range; setRange: (r: Range) => void; fetching: boolean }) {
  const { open } = useAssistant()
  const r = data.revenue!
  const series = data.series!
  const up = r.changePct >= 0
  return (
    <div className="min-w-0 px-4 pb-8 pt-8 md:px-7 lg:pr-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="label text-stone-600">Net revenue · {data.period.label}</h1>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <CountUp value={r.total} format={inr} className="font-serif text-[clamp(56px,8.4vw,112px)] leading-[0.86] tracking-[-0.02em]" />
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[12px]">
          <motion.span key={range} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`tnum rounded-[3px] px-1.5 py-0.5 ${up ? 'bg-lime text-ink-950 ring-1 ring-ink-950' : 'bg-ink-950 text-paper-50'}`}>{pct(r.changePct)}</motion.span>
          <span className="tnum text-stone-600">vs {inr(r.previousTotal)}</span>
        </div>
      </div>
      <p className="mt-5 max-w-[620px] font-serif text-[21px] leading-[1.35] text-stone-800">
        {up ? 'Ahead of' : 'Behind'} the {data.period.compareLabel} by {inr(Math.abs(r.total - r.previousTotal))}. The strongest day was {shortDate(r.peak.date)} at {inr(r.peak.value)};{' '}
        {data.stock.low + data.stock.out} products need restocking.
      </p>
      <div className={`mt-6 transition-opacity duration-300 ${fetching ? 'opacity-60' : ''}`}>
        <RevenueChart rangeKey={range} dates={series.dates} current={series.current} previous={series.previous} height={320} peakLabel={`Strongest day · ${inr(r.peak.value)}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 bg-ink-950" />Running total</span>
        <span className="inline-flex items-center gap-2"><span className="w-4 border-t border-dashed border-stone-500" />Previous period</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-1.5 bg-paper-300" />Daily revenue</span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-paper-300 pt-4 text-[13.5px]">
        <span className="inline-flex items-center gap-2 font-medium"><AssistantMark className="h-3.5 w-3.5" />Ask about this period</span>
        {['Compare revenue with the previous month', 'Top products by revenue', 'Summarise the last 30 days'].map((q) => (
          <button key={q} onClick={() => open(q)} className="link-underline text-left text-stone-800 hover:text-ink-950">{q}</button>
        ))}
      </div>
    </div>
  )
}

function Ledger({ data }: { data: Overview }) {
  return (
    <aside aria-label="Operating ledger" className="on-ink hairline-grid relative bg-ink-950 px-5 py-8 text-paper-50 md:px-7">
      <div className="flex items-baseline justify-between">
        <h2 className="label text-ink-300">Operating ledger</h2>
        <span className="label text-ink-400">{data.period.label}</span>
      </div>
      <motion.ul className="mt-5 border-t border-ink-700" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}>
        {data.ledger!.map((m) => (
          <motion.li key={m.key} variants={{ h: { opacity: 0, x: 12 }, v: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } } }}>
            <Link to={m.href} className={`group relative flex items-center justify-between gap-4 border-b border-ink-800 py-4 pl-3 pr-1 transition-colors hover:bg-ink-900 ${m.attention ? 'bg-ink-900' : ''}`}>
              {m.attention && <span className="absolute inset-y-0 left-0 w-[3px] bg-lime" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-[13px] text-ink-300">{m.label}</span>
                <CountUp value={m.value} format={(n) => formatMetric(n, m.format)} className="mt-1 block font-serif text-[31px] leading-none tracking-[-0.01em]" />
                <span className="mt-1.5 block truncate font-mono text-[11px] text-ink-400">{m.note}</span>
              </span>
              <span className="flex items-center gap-2 text-lime">
                <Sparkline data={m.trend} stroke="#CDF545" />
                <ChevronRight className="h-4 w-4 -translate-x-1 text-ink-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
              </span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </aside>
  )
}

/** Staff see the operational picture; financial figures are not sent to their role. */
function FloorLead({ data }: { data: Overview }) {
  const { open } = useAssistant()
  const openOrders = data.orders.filter((o) => ['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(o.status))
  const first = data.user.name.split(' ')[0]
  return (
    <div className="min-w-0 px-4 pb-8 pt-8 md:px-7 lg:pr-10">
      <h1 className="label text-stone-600">Today on the floor</h1>
      <div className="mt-4 flex items-end gap-5">
        <CountUp value={openOrders.length} format={(n) => String(Math.round(n))} className="font-serif text-[clamp(72px,10vw,132px)] leading-[0.82]" />
        <span className="mb-2 max-w-[240px] text-[15px] leading-snug text-stone-600">open orders among the latest ten, {openOrders.filter((o) => o.status === 'PROCESSING').length} being processed</span>
      </div>
      <p className="mt-6 max-w-[620px] font-serif text-[22px] leading-[1.35] text-stone-800">
        Good to see you, {first}. {data.stock.low + data.stock.out > 0 ? `${data.stock.low + data.stock.out} products need restocking, ${data.stock.out} of them already out.` : 'Every product is above its reorder level.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Link to="/app/orders?new=1" className="inline-flex h-10 items-center rounded-full bg-ink-950 px-5 text-[14px] text-paper-50 hover:bg-ink-800">New sales order</Link>
        <Link to="/app/purchase-orders?status=OPEN" className="inline-flex h-10 items-center rounded-full border border-ink-950 px-5 text-[14px] hover:bg-ink-950 hover:text-paper-50">Receive deliveries</Link>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-paper-300 pt-4 text-[13.5px]">
        <span className="inline-flex items-center gap-2 font-medium"><AssistantMark className="h-3.5 w-3.5" />Ask</span>
        {['Which products need restocking?', 'Which orders are still pending?'].map((q) => <button key={q} onClick={() => open(q)} className="link-underline text-left text-stone-800">{q}</button>)}
      </div>
    </div>
  )
}

function FloorPanel({ data }: { data: Overview }) {
  const rows = [
    { label: 'Out of stock', value: data.stock.out, href: '/app/inventory?stock=out', attention: data.stock.out > 0 },
    { label: 'Below reorder level', value: data.stock.low, href: '/app/inventory?stock=low' },
    { label: 'Healthy products', value: data.stock.healthy, href: '/app/inventory?stock=ok' },
    { label: 'Orders being processed', value: data.orders.filter((o) => o.status === 'PROCESSING').length, href: '/app/orders?status=PROCESSING' },
    { label: 'Drafts to confirm', value: data.orders.filter((o) => o.status === 'DRAFT').length, href: '/app/orders?status=DRAFT' },
  ]
  return (
    <aside aria-label="Operations" className="on-ink hairline-grid bg-ink-950 px-5 py-8 text-paper-50 md:px-7">
      <h2 className="label text-ink-300">Operations</h2>
      <ul className="mt-5 border-t border-ink-700">
        {rows.map((m) => (
          <li key={m.label}>
            <Link to={m.href} className={`relative flex items-center justify-between border-b border-ink-800 py-4 pl-3 pr-1 hover:bg-ink-900 ${m.attention ? 'bg-ink-900' : ''}`}>
              {m.attention && <span className="absolute inset-y-0 left-0 w-[3px] bg-lime" aria-hidden="true" />}
              <span className="text-[13.5px] text-ink-300">{m.label}</span>
              <span className="tnum font-serif text-[31px] leading-none">{m.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function StockPosition({ data }: { data: Overview }) {
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [focus, setFocus] = useState<StockItem | null>(null)
  const items = data.stock.items
  const urgent = useMemo(() => items.filter((p) => p.state !== 'ok').sort((a, b) => a.onHand / Math.max(a.dailySales, 0.001) - b.onHand / Math.max(b.dailySales, 0.001)).slice(0, 4), [items])
  const cover = (p: StockItem) => (p.onHand === 0 ? 'Out' : p.dailySales > 0 ? `${Math.max(1, Math.round(p.onHand / p.dailySales))}d` : '—')
  const filters = [{ id: 'all', label: `All ${items.length}` }, { id: 'low', label: `Low ${data.stock.low}` }, { id: 'out', label: `Out ${data.stock.out}` }] as const

  return (
    <section aria-labelledby="stock-h" className="min-w-0 px-4 py-8 md:px-7">
      <div className="flex items-baseline justify-between">
        <h2 id="stock-h" className="font-serif text-[26px] leading-none">Stock position</h2>
        <Link to="/app/inventory" className="label link-underline text-ink-950">Inventory</Link>
      </div>
      <div className="mt-4 flex gap-4 text-[12.5px]" role="tablist" aria-label="Filter stock grid">
        {filters.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`relative pb-1 transition-colors ${filter === f.id ? 'text-ink-950' : 'text-stone-500 hover:text-ink-950'}`}>
            {f.label}
            {filter === f.id && <motion.span layoutId="stock-filter" className="absolute inset-x-0 -bottom-px h-px bg-ink-950" />}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-12 gap-[3px]" onMouseLeave={() => setFocus(null)}>
        {items.map((p, i) => {
          const dim = filter !== 'all' && p.state !== filter
          return (
            <motion.button key={p.id} aria-label={`${p.name}: ${p.onHand} on hand, reorder at ${p.reorderAt}`} onMouseEnter={() => setFocus(p)} onFocus={() => setFocus(p)}
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: dim ? 0.14 : 1, scale: focus?.id === p.id ? 1.18 : 1 }}
              transition={{ opacity: { duration: 0.25, delay: filter === 'all' ? i * 0.006 : 0 }, scale: { type: 'spring', stiffness: 600, damping: 30 } }}
              className={`aspect-square ${p.state === 'ok' ? 'bg-ink-950' : p.state === 'low' ? 'bg-lime ring-1 ring-inset ring-ink-950' : 'hatch text-ink-950 ring-1 ring-inset ring-ink-950'}`} />
          )
        })}
      </div>
      <div className="mt-3 h-9 border-y border-paper-300 font-mono text-[11.5px]" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={focus?.id ?? 'legend'} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.14 }} className="flex h-full items-center justify-between gap-3">
            {focus ? (
              <><span className="truncate font-sans text-[12.5px]">{focus.name}</span><span className="tnum shrink-0 text-stone-600">{focus.onHand} / {focus.reorderAt} · {cover(focus)}</span></>
            ) : (
              <span className="tnum text-stone-600">{data.stock.healthy} healthy · {data.stock.low} below reorder · {data.stock.out} out</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <h3 className="label mt-6 flex justify-between border-b border-ink-950 pb-2 text-stone-600"><span>Runs out first</span><span>Cover</span></h3>
      <ul>
        {urgent.map((p) => {
          const f = Math.min(1, p.onHand / (p.reorderAt * 1.6))
          return (
            <li key={p.id}>
              <Link to={`/app/inventory/${p.id}`} className="group grid grid-cols-[minmax(0,1fr)_44px] gap-x-3 gap-y-2 border-b border-paper-200 py-3 transition-colors hover:bg-paper-100">
                <span className="truncate text-[13.5px]">{p.name}</span>
                <span className="tnum text-right font-mono text-[12px]">{cover(p)}</span>
                <span className="relative col-span-2 h-[3px] bg-paper-200">
                  <motion.span className={`absolute inset-y-0 left-0 ${p.onHand === 0 ? 'bg-ink-950' : 'bg-ink-950'}`} initial={{ width: 0 }} whileInView={{ width: `${Math.max(f * 100, 1.5)}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} />
                  <span className="absolute -top-[3px] h-[9px] w-px bg-stone-500" style={{ left: `${100 / 1.6}%` }} title="Reorder point" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {urgent.length > 0 && (
        <Can permission="purchaseOrders:write">
          <Link to={`/app/purchase-orders?new=${urgent.map((p) => p.id).join(',')}`} className="mt-5 inline-flex h-9 items-center rounded-full border border-ink-950 px-4 text-[13px] font-medium transition-colors hover:bg-ink-950 hover:text-paper-50">Draft purchase order · {urgent.length} items</Link>
        </Can>
      )}
    </section>
  )
}

function OrdersTable({ data }: { data: Overview }) {
  const [tab, setTab] = useState<'all' | 'open' | 'completed' | 'cancelled'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const filtered = data.orders.filter((o) => tab === 'all' || (tab === 'open' ? ['DRAFT', 'CONFIRMED', 'PROCESSING'].includes(o.status) : o.status.toLowerCase() === tab))
  const tabs = [['all', 'All', data.orderCounts.all], ['open', 'Open', data.orderCounts.open], ['completed', 'Completed', data.orderCounts.completed], ['cancelled', 'Cancelled', data.orderCounts.cancelled]] as const

  const Row = ({ o }: { o: OrderRow }) => {
    const isOpen = expanded === o.id
    return (
      <>
        <tr onClick={() => setExpanded(isOpen ? null : o.id)} className={`group cursor-pointer border-b border-paper-200 transition-colors hover:bg-paper-100 ${isOpen ? 'bg-paper-100' : ''}`}>
          <td className="py-2.5 pl-1 font-mono text-[12px]">
            <button aria-expanded={isOpen} aria-label={`Show lines for ${o.number}`} className="inline-flex items-center gap-1.5">
              <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-stone-500"><ChevronRight className="h-3.5 w-3.5" /></motion.span>{o.number}
            </button>
          </td>
          <td className="max-w-[220px] truncate py-2.5 text-[13.5px]">{o.customer}</td>
          <td className="tnum hidden py-2.5 text-[13px] text-stone-600 sm:table-cell">{shortDate(o.placedAt)} · {time(o.placedAt)}</td>
          <td className="py-2.5 text-[13px]"><StatusDot status={o.status} /></td>
          <td className="tnum py-2.5 pr-1 text-right font-mono text-[12.5px]">{inr(o.total)}</td>
        </tr>
        <AnimatePresence initial={false}>
          {isOpen && (
            <tr>
              <td colSpan={5} className="p-0">
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden border-b border-paper-300 bg-paper-100">
                  <div className="px-7 py-3">
                    {o.lines.map((l, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_60px_90px] gap-3 py-1.5 text-[12.5px]">
                        <span className="truncate">{l.product} <span className="font-mono text-[11px] text-stone-500">{l.sku}</span></span>
                        <span className="tnum text-right font-mono text-stone-600">× {l.qty}</span>
                        <span className="tnum text-right font-mono">{inr(l.qty * l.unitPrice)}</span>
                      </div>
                    ))}
                    <Link to={`/app/orders/${o.id}`} className="mt-2 inline-block text-[12.5px] link-underline">Open {o.number}</Link>
                  </div>
                </motion.div>
              </td>
            </tr>
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <section aria-labelledby="orders-h" className="min-w-0 px-4 py-8 md:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="orders-h" className="font-serif text-[26px] leading-none">Sales orders</h2>
        <div role="tablist" aria-label="Order status" className="flex gap-4 text-[12.5px]">
          {tabs.map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setExpanded(null) }} className={`relative pb-1 transition-colors ${tab === id ? 'text-ink-950' : 'text-stone-500 hover:text-ink-950'}`}>
              {label} <span className="tnum text-stone-500">{n}</span>
              {tab === id && <motion.span layoutId="orders-tab" className="absolute inset-x-0 -bottom-px h-px bg-ink-950" />}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-ink-950">
              {['Order', 'Customer', 'Placed', 'Status', 'Total'].map((h, i) => (
                <th key={h} scope="col" className={`label pb-2 font-normal text-stone-600 ${i === 4 ? 'pr-1 text-right' : 'text-left'} ${i === 0 ? 'pl-1' : ''} ${i === 2 ? 'hidden sm:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <AnimatePresence mode="wait" initial={false}>
            <motion.tbody key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {filtered.map((o) => <Row key={o.id} o={o} />)}
              {filtered.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[13px] text-stone-500">No orders with this status in the period.</td></tr>}
            </motion.tbody>
          </AnimatePresence>
        </table>
      </div>
      <div className="mt-3 flex justify-between text-[12.5px] text-stone-600">
        <span className="tnum">{filtered.length} shown</span>
        <Link to="/app/orders" className="link-underline text-ink-950">All sales orders</Link>
      </div>
    </section>
  )
}

function Activity({ items }: { items: ActivityItem[] }) {
  const today = new Date().toDateString()
  const groups = [
    { label: 'Today', list: items.filter((a) => new Date(a.at).toDateString() === today) },
    { label: 'Earlier', list: items.filter((a) => new Date(a.at).toDateString() !== today) },
  ].filter((g) => g.list.length)
  const mark: Record<ActivityItem['kind'], string> = {
    'stock-in': 'bg-ink-950', payment: 'bg-lime ring-1 ring-ink-950', order: 'bg-paper-50 ring-1 ring-ink-950', alert: 'rotate-45 bg-paper-50 ring-1 ring-ink-950', invoice: 'bg-paper-50 ring-1 ring-stone-500',
  }
  return (
    <section aria-labelledby="act-h" className="min-w-0 px-4 py-8 md:px-7">
      <h2 id="act-h" className="font-serif text-[26px] leading-none">Activity</h2>
      {groups.map((g) => (
        <div key={g.label} className="mt-6">
          <h3 className="label text-stone-500">{g.label}</h3>
          <ol className="mt-3 border-l border-ink-950">
            {g.list.map((a, i) => (
              <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.4, ease: EASE }} className="relative pb-4 pl-4">
                <span className={`absolute -left-[4px] top-[5px] h-[7px] w-[7px] ${mark[a.kind]}`} aria-hidden="true" />
                <div className="tnum font-mono text-[11px] text-stone-500">{time(a.at)} · {a.actor}</div>
                <p className="mt-1 text-[13.5px] leading-snug">{a.text}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      ))}
      <Link to="/app/settings" className="text-[12.5px] link-underline">Audit log</Link>
    </section>
  )
}

function Loading() {
  return (
    <div className="mx-auto max-w-[1440px]" aria-busy="true" aria-label="Loading overview">
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5 px-4 py-8 md:px-7">
          <Skeleton className="h-3 w-40" /><Skeleton className="h-24 w-[420px] max-w-full" /><Skeleton className="h-5 w-[560px] max-w-full" /><Skeleton className="h-[300px] w-full" />
        </div>
        <div className="space-y-4 bg-ink-950 px-7 py-8 text-paper-50">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>('30d')
  const q = useOverview(range)
  if (q.isLoading) return <Loading />
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-[1440px] px-7 py-24" role="alert">
        <h1 className="font-serif text-[40px]">The overview couldn’t load.</h1>
        <p className="mt-3 text-stone-600">{q.error instanceof Error ? q.error.message : 'Unknown error'}</p>
        <button onClick={() => q.refetch()} className="mt-6 h-10 rounded-full bg-ink-950 px-5 text-[14px] text-paper-50">Retry</button>
      </div>
    )
  const d = q.data
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="grid grid-cols-[minmax(0,1fr)] border-b border-paper-300 lg:grid-cols-[minmax(0,1fr)_420px]">
        {d.revenue ? <Lead data={d} range={range} setRange={setRange} fetching={q.isFetching} /> : <FloorLead data={d} />}
        {d.ledger ? <Ledger data={d} /> : <FloorPanel data={d} />}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] divide-y divide-paper-300 lg:grid-cols-[340px_minmax(0,1fr)_320px] lg:divide-x lg:divide-y-0">
        <StockPosition data={d} />
        <OrdersTable data={d} />
        <Activity items={d.activity} />
      </div>
      <footer className="label flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-950 px-4 py-3 text-stone-500 md:px-7">
        <span className="tnum">Computed from {d.meta.rowsScanned.toLocaleString('en-IN')} records</span>
        <span>Revenue = confirmed + completed orders, after discount, before tax</span>
        <span>Updated {time(d.meta.generatedAt)}</span>
      </footer>
    </div>
  )
}
