import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable, EmptyState, PageHeader, Pagination, SearchInput, Status, Tabs, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { Button, EASE } from '../../../components/ui/primitives'
import { useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, shortDate, time } from '../../../lib/format'
import type { OrderStatus, Page, SalesOrderRow } from '../../../lib/types'
import { Can } from '../../auth'
import OrderForm from './OrderForm'

type List = Page<SalesOrderRow> & { counts: Partial<Record<OrderStatus, number>> }
const LANES: { s: OrderStatus; label: string; cls: string }[] = [
  { s: 'DRAFT', label: 'Draft', cls: 'bg-paper-50 [background-image:repeating-linear-gradient(135deg,#77736A_0_1px,transparent_1px_5px)]' },
  { s: 'CONFIRMED', label: 'Confirmed', cls: 'bg-stone-500' },
  { s: 'PROCESSING', label: 'Processing', cls: 'bg-lime' },
  { s: 'COMPLETED', label: 'Completed', cls: 'bg-ink-950' },
  { s: 'CANCELLED', label: 'Cancelled', cls: 'bg-paper-300' },
]

/** The pipeline: open work is drawn at its true share next to everything completed. */
function Pipeline({ counts, onPick, active }: { counts: Partial<Record<OrderStatus, number>>; onPick: (s: OrderStatus) => void; active: string }) {
  const open = LANES.slice(0, 3)
  const openTotal = open.reduce((s, l) => s + (counts[l.s] ?? 0), 0)
  return (
    <section aria-label="Order pipeline" className="grid gap-6 border-b border-paper-300 px-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-7">
      <div>
        <div className="label text-stone-600">Open work · {openTotal} orders</div>
        <div className="mt-3 flex h-10 w-full overflow-hidden rounded-[4px] ring-1 ring-ink-950">
          {open.map((l) => {
            const n = counts[l.s] ?? 0
            return n ? (
              <motion.button key={l.s} onClick={() => onPick(l.s)} aria-label={`${l.label}: ${n}`} title={`${l.label}: ${n}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: n }} transition={{ duration: 0.7, ease: EASE }}
                className={`relative min-w-[40px] basis-0 border-r border-ink-950 last:border-r-0 ${l.cls} ${active === l.s ? 'outline outline-2 -outline-offset-4 outline-ink-950' : ''}`}>
                <span className={`absolute bottom-1 left-2 font-mono text-[11px] ${l.s === 'CONFIRMED' ? 'text-paper-50' : 'text-ink-950'}`}>{n}</span>
              </motion.button>
            ) : null
          })}
          {openTotal === 0 && <div className="grid flex-1 place-items-center text-[12.5px] text-stone-500">No open orders</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-stone-600">
          {open.map((l) => <span key={l.s} className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 ring-1 ring-ink-950 ${l.cls}`} />{l.label}</span>)}
        </div>
      </div>
      <dl className="flex gap-8">
        <div><dt className="label text-stone-600">Completed</dt><dd className="tnum mt-1 font-serif text-[34px] leading-none">{(counts.COMPLETED ?? 0).toLocaleString('en-IN')}</dd></div>
        <div><dt className="label text-stone-600">Cancelled</dt><dd className="tnum mt-1 font-serif text-[34px] leading-none text-stone-500">{counts.CANCELLED ?? 0}</dd></div>
      </dl>
    </section>
  )
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const { values: f, page, set } = useListParams({ q: '', status: 'ALL', sort: 'createdAt:desc' })
  const [sort, order] = f.sort.split(':')
  const list = useList<List>(['orders', f, page], `/sales-orders${qs({ q: f.q, status: f.status, sort, order, page, pageSize: 25 })}`)
  const c = list.data?.counts ?? {}
  useEffect(() => { if (sp.get('new')) { setCreating(true); sp.delete('new'); setSp(sp, { replace: true }) } }, [sp, setSp])

  const cols: Column<SalesOrderRow>[] = [
    { key: 'n', header: 'Order', sort: 'number', cell: (o) => <Link to={`/app/orders/${o.id}`} className="font-mono text-[12.5px] group-hover:underline">{o.number}</Link> },
    { key: 'c', header: 'Customer', cell: (o) => <span className="block max-w-[260px] truncate">{o.customer.name}</span> },
    { key: 'd', header: 'Placed', sort: 'createdAt', hide: 'md', cell: (o) => <span className="tnum text-stone-600">{shortDate(o.createdAt)} · {time(o.createdAt)}</span> },
    { key: 'l', header: 'Lines', align: 'right', hide: 'lg', cell: (o) => <span className="font-mono text-[12.5px] text-stone-600">{o.lineCount}</span> },
    { key: 's', header: 'Status', cell: (o) => <Status kind="order" status={o.status} /> },
    { key: 'i', header: 'Invoice', hide: 'sm', cell: (o) => o.invoice ? <Link to={`/app/invoices/${o.invoice.id}`} className="font-mono text-[12px] link-underline">{o.invoice.number}</Link> : <span className="text-stone-500">—</span> },
    { key: 't', header: 'Total', align: 'right', sort: 'total', cell: (o) => <span className="font-mono text-[12.5px]">{inr(o.total)}</span> },
  ]
  const tabs = [
    { value: 'ALL', label: 'All' }, { value: 'OPEN', label: 'Open', count: (c.DRAFT ?? 0) + (c.CONFIRMED ?? 0) + (c.PROCESSING ?? 0) },
    { value: 'DRAFT', label: 'Draft', count: c.DRAFT ?? 0 }, { value: 'CONFIRMED', label: 'Confirmed', count: c.CONFIRMED ?? 0 }, { value: 'PROCESSING', label: 'Processing', count: c.PROCESSING ?? 0 },
    { value: 'COMPLETED', label: 'Completed', count: c.COMPLETED ?? 0 }, { value: 'CANCELLED', label: 'Cancelled', count: c.CANCELLED ?? 0 },
  ]

  return (
    <div>
      <PageHeader eyebrow="Sales" title={<>Sales <span className="font-serif font-normal italic">orders.</span></>} actions={<Can permission="salesOrders:write"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New order</Button></Can>}>
        Drafts hold no stock. Confirming reserves it in one transaction; cancelling a confirmed order returns it once.
      </PageHeader>
      <Pipeline counts={c} active={f.status} onPick={(s) => set({ status: s, page: 1 })} />
      <div className={toolbar}>
        <Tabs id="orders" value={f.status} onChange={(v) => set({ status: v, page: 1 })} options={tabs} />
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Order number or customer" />
      </div>
      <div className={`mt-2 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
        <DataTable caption="Sales orders" rows={list.data?.items} columns={cols} loading={list.isLoading}
          sort={{ key: sort, order: order as 'asc' | 'desc' }} onSort={(k) => set({ sort: `${k}:${k === sort && order === 'desc' ? 'asc' : 'desc'}`, page: 1 })}
          onRowClick={(o) => navigate(`/app/orders/${o.id}`)}
          empty={<EmptyState title={f.q || f.status !== 'ALL' ? 'No orders match' : 'No sales orders yet'} body={f.q || f.status !== 'ALL' ? 'Try another status or search.' : 'Create a draft, then confirm it to reserve stock.'} />} />
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
      <OrderForm open={creating} onClose={() => setCreating(false)} onSaved={(o) => navigate(`/app/orders/${o.id}`)} />
    </div>
  )
}
