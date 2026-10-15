import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, EmptyState, PageHeader, Pagination, SearchInput, Tabs, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, shortDate } from '../../../lib/format'
import type { Page, SupplierRow } from '../../../lib/types'
import { Can } from '../../auth'
import PartyForm from './PartyForm'

export default function SuppliersPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { values: f, page, set } = useListParams({ q: '', status: 'ALL' })
  const list = useList<Page<SupplierRow>>(['suppliers', f, page], `/suppliers${qs({ q: f.q, status: f.status, page, pageSize: 25 })}`)

  const cols: Column<SupplierRow>[] = [
    { key: 'n', header: 'Supplier', cell: (s) => (
      <Link to={`/app/suppliers/${s.id}`} className="block min-w-[200px]">
        <span className="font-medium group-hover:underline">{s.name}</span>{s.status === 'INACTIVE' && <span className="ml-2 font-mono text-[11px] text-stone-500">inactive</span>}
        <span className="block text-[12px] text-stone-500">{[s.contactName, s.email].filter(Boolean).join(' · ') || '—'}</span>
      </Link>
    ) },
    { key: 'p', header: 'Products', align: 'right', hide: 'sm', cell: (s) => <span className="font-mono text-[12.5px]">{s.productCount}</span> },
    { key: 'po', header: 'Purchase orders', align: 'right', hide: 'md', cell: (s) => <span className="font-mono text-[12.5px] text-stone-600">{s.purchaseOrderCount}</span> },
    { key: 'l', header: 'Last ordered', hide: 'lg', cell: (s) => <span className="tnum text-stone-600">{s.lastOrderedAt ? shortDate(s.lastOrderedAt) : '—'}</span> },
    { key: 'o', header: 'On order', align: 'right', cell: (s) => <span className={`font-mono text-[12.5px] ${s.openOrderValue ? 'font-medium' : 'text-stone-500'}`}>{s.openOrderValue ? inr(s.openOrderValue) : '—'}</span> },
    { key: 'r', header: 'Bought to date', align: 'right', hide: 'sm', cell: (s) => <span className="font-mono text-[12.5px] text-stone-600">{inr(s.receivedValue)}</span> },
  ]
  return (
    <div>
      <PageHeader eyebrow="Suppliers" title={<>Where stock <span className="font-serif font-normal italic">comes from.</span></>} actions={<Can permission="suppliers:write"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add supplier</Button></Can>}>
        “On order” is the value of purchase orders sent but not fully received.
      </PageHeader>
      <div className={toolbar}>
        <Tabs id="sup" value={f.status} onChange={(v) => set({ status: v, page: 1 })} options={[{ value: 'ALL', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Name, contact or email" />
      </div>
      <div className={`mt-2 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
        <DataTable caption="Suppliers" rows={list.data?.items} columns={cols} loading={list.isLoading} onRowClick={(s) => navigate(`/app/suppliers/${s.id}`)} empty={<EmptyState title={f.q ? 'No suppliers match' : 'No suppliers yet'} />} />
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
      <PartyForm kind="supplier" open={creating} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/app/suppliers/${s.id}`)} />
    </div>
  )
}
