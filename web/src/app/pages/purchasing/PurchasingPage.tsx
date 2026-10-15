import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable, EmptyState, Figures, PageHeader, Pagination, SearchInput, Status, Tabs, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, shortDate } from '../../../lib/format'
import type { POStatus, Page, PurchaseOrderRow } from '../../../lib/types'
import { Can } from '../../auth'
import POForm from './POForm'

type List = Page<PurchaseOrderRow> & { counts: Partial<Record<POStatus, number>> }

function Received({ po }: { po: PurchaseOrderRow }) {
  const f = po.orderedUnits ? po.receivedUnits / po.orderedUnits : 0
  return (
    <span className="flex items-center gap-3">
      <span className="relative block h-[5px] w-20 bg-paper-200"><span className="absolute inset-y-0 left-0 bg-ink-950" style={{ width: `${f * 100}%` }} /></span>
      <span className="tnum font-mono text-[12px] text-stone-600">{po.receivedUnits}/{po.orderedUnits}</span>
    </span>
  )
}

export default function PurchasingPage() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [form, setForm] = useState<{ open: boolean; prefill?: string[] }>({ open: false })
  const { values: f, page, set } = useListParams({ q: '', status: 'ALL' })
  const list = useList<List>(['purchase-orders', f, page], `/purchase-orders${qs({ q: f.q, status: f.status, page, pageSize: 25 })}`)
  const c = list.data?.counts ?? {}
  useEffect(() => {
    const n = sp.get('new')
    if (n) { setForm({ open: true, prefill: n === '1' ? undefined : n.split(',').filter(Boolean) }); sp.delete('new'); setSp(sp, { replace: true }) }
  }, [sp, setSp])

  const late = (po: PurchaseOrderRow) => ['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status) && po.expectedAt && new Date(po.expectedAt) < new Date()
  const cols: Column<PurchaseOrderRow>[] = [
    { key: 'n', header: 'Order', cell: (p) => <Link to={`/app/purchase-orders/${p.id}`} className="font-mono text-[12.5px] group-hover:underline">{p.number}</Link> },
    { key: 's', header: 'Supplier', cell: (p) => <span className="block max-w-[240px] truncate">{p.supplier.name}</span> },
    { key: 'o', header: 'Ordered', hide: 'md', cell: (p) => <span className="tnum text-stone-600">{p.orderedAt ? shortDate(p.orderedAt) : 'Not sent'}</span> },
    { key: 'e', header: 'Expected', hide: 'lg', cell: (p) => <span className={`tnum ${late(p) ? 'font-medium' : 'text-stone-600'}`}>{p.expectedAt ? `${shortDate(p.expectedAt)}${late(p) ? ' · late' : ''}` : '—'}</span> },
    { key: 'r', header: 'Received', hide: 'sm', cell: (p) => <Received po={p} /> },
    { key: 'st', header: 'Status', cell: (p) => <Status kind="po" status={p.status} /> },
    { key: 't', header: 'Total', align: 'right', cell: (p) => <span className="font-mono text-[12.5px]">{inr(p.total)}</span> },
  ]

  return (
    <div>
      <PageHeader eyebrow="Purchasing" title={<>Purchase <span className="font-serif font-normal italic">orders.</span></>} actions={<Can permission="purchaseOrders:write"><Button onClick={() => setForm({ open: true })}><Plus className="h-4 w-4" />New purchase order</Button></Can>}>
        Draft, send to the supplier, then receive what actually arrives — in full or in parts.
      </PageHeader>
      <Figures items={[
        { label: 'Drafts', value: c.DRAFT ?? 0 },
        { label: 'Awaiting delivery', value: (c.ORDERED ?? 0) + (c.PARTIALLY_RECEIVED ?? 0), accent: (c.ORDERED ?? 0) + (c.PARTIALLY_RECEIVED ?? 0) > 0 },
        { label: 'Partly received', value: c.PARTIALLY_RECEIVED ?? 0 },
        { label: 'Received', value: c.RECEIVED ?? 0 },
      ]} />
      <div className={toolbar}>
        <Tabs id="po" value={f.status} onChange={(v) => set({ status: v, page: 1 })} options={[
          { value: 'ALL', label: 'All' }, { value: 'OPEN', label: 'Open', count: (c.DRAFT ?? 0) + (c.ORDERED ?? 0) + (c.PARTIALLY_RECEIVED ?? 0) }, { value: 'DRAFT', label: 'Draft', count: c.DRAFT ?? 0 },
          { value: 'ORDERED', label: 'Ordered', count: c.ORDERED ?? 0 }, { value: 'PARTIALLY_RECEIVED', label: 'Partly received', count: c.PARTIALLY_RECEIVED ?? 0 }, { value: 'RECEIVED', label: 'Received', count: c.RECEIVED ?? 0 }, { value: 'CANCELLED', label: 'Cancelled', count: c.CANCELLED ?? 0 },
        ]} />
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="PO number or supplier" />
      </div>
      <div className={`mt-2 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
        <DataTable caption="Purchase orders" rows={list.data?.items} columns={cols} loading={list.isLoading} onRowClick={(p) => navigate(`/app/purchase-orders/${p.id}`)}
          empty={<EmptyState title={f.q || f.status !== 'ALL' ? 'No purchase orders match' : 'No purchase orders yet'} body="Low stock on the overview can start a draft for you." />} />
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
      <POForm open={form.open} prefill={form.prefill} onClose={() => setForm({ open: false })} onSaved={(p) => navigate(`/app/purchase-orders/${p.id}`)} />
    </div>
  )
}
