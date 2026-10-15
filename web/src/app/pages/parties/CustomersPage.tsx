import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, EmptyState, PageHeader, Pagination, SearchInput, Tabs, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, shortDate } from '../../../lib/format'
import type { CustomerRow, Page } from '../../../lib/types'
import { Can } from '../../auth'
import PartyForm from './PartyForm'

export default function CustomersPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { values: f, page, set } = useListParams({ q: '', status: 'ALL', sort: 'totalPurchases:desc' })
  const [sort, order] = f.sort.split(':')
  const list = useList<Page<CustomerRow>>(['customers', f, page], `/customers${qs({ q: f.q, status: f.status, sort, order, page, pageSize: 25 })}`)
  const max = Math.max(1, ...(list.data?.items.map((c) => c.totalPurchases) ?? [1]))

  const cols: Column<CustomerRow>[] = [
    { key: 'n', header: 'Customer', sort: 'name', cell: (c) => (
      <Link to={`/app/customers/${c.id}`} className="block min-w-[200px]">
        <span className="font-medium group-hover:underline">{c.name}</span>{c.status === 'INACTIVE' && <span className="ml-2 font-mono text-[11px] text-stone-500">inactive</span>}
        <span className="block text-[12px] text-stone-500">{[c.contactName, c.phone].filter(Boolean).join(' · ') || '—'}</span>
      </Link>
    ) },
    { key: 'o', header: 'Orders', align: 'right', hide: 'md', cell: (c) => <span className="font-mono text-[12.5px] text-stone-600">{c.orderCount}</span> },
    { key: 'l', header: 'Last order', hide: 'lg', cell: (c) => <span className="tnum text-stone-600">{c.lastOrderAt ? shortDate(c.lastOrderAt) : '—'}</span> },
    { key: 'p', header: 'Total purchases', sort: 'totalPurchases', width: '240px', cell: (c) => (
      <span className="flex items-center justify-end gap-3">
        <span className="hidden h-[5px] w-20 bg-paper-200 sm:block"><span className="block h-full bg-ink-950" style={{ width: `${(c.totalPurchases / max) * 100}%` }} /></span>
        <span className="tnum w-28 text-right font-mono text-[12.5px]">{inr(c.totalPurchases)}</span>
      </span>
    ) },
    { key: 'd', header: 'Outstanding', sort: 'outstanding', align: 'right', cell: (c) => <span className={`font-mono text-[12.5px] ${c.outstanding > 0 ? 'font-medium' : 'text-stone-500'}`}>{c.outstanding > 0 ? inr(c.outstanding) : '—'}</span> },
  ]
  return (
    <div>
      <PageHeader eyebrow="Customers" title={<>Who <span className="font-serif font-normal italic">buys</span> from you.</>} actions={<Can permission="customers:write"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add customer</Button></Can>}>
        Purchases count confirmed and completed orders. Outstanding is what their open invoices still owe.
      </PageHeader>
      <div className={toolbar}>
        <Tabs id="cust" value={f.status} onChange={(v) => set({ status: v, page: 1 })} options={[{ value: 'ALL', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Name, contact, email or phone" />
      </div>
      <div className={`mt-2 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
        <DataTable caption="Customers" rows={list.data?.items} columns={cols} loading={list.isLoading}
          sort={{ key: sort, order: order as 'asc' | 'desc' }} onSort={(k) => set({ sort: `${k}:${k === sort && order === 'desc' ? 'asc' : 'desc'}`, page: 1 })}
          onRowClick={(c) => navigate(`/app/customers/${c.id}`)} empty={<EmptyState title={f.q ? 'No customers match' : 'No customers yet'} />} />
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
      <PartyForm kind="customer" open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/app/customers/${c.id}`)} />
    </div>
  )
}
