import { Link, useNavigate } from 'react-router-dom'
import { DataTable, EmptyState, Figures, PageHeader, Pagination, SearchInput, Status, Tabs, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, lakh, shortDate } from '../../../lib/format'
import type { InvoiceRow, Page } from '../../../lib/types'

type List = Page<InvoiceRow> & { summary: { outstanding: number; overdue: number; overdueCount: number; openCount: number; collected30: number } }

/** Aging bar: how far past due an invoice is, on a 60-day scale. */
function Aging({ i }: { i: InvoiceRow }) {
  if (!['UNPAID', 'PARTIALLY_PAID'].includes(i.status)) return <span className="text-stone-500">—</span>
  const days = Math.round((Date.now() - new Date(i.dueDate).getTime()) / 86_400_000)
  if (days <= 0) return <span className="tnum font-mono text-[12px] text-stone-600">due in {-days}d</span>
  return (
    <span className="flex items-center gap-2">
      <span className="relative block h-[5px] w-16 bg-paper-200"><span className="hatch absolute inset-y-0 left-0 text-ink-950" style={{ width: `${Math.min(100, (days / 60) * 100)}%` }} /></span>
      <span className="tnum font-mono text-[12px] font-medium">{days}d late</span>
    </span>
  )
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const { values: f, page, set } = useListParams({ q: '', status: 'ALL', sort: 'issueDate:desc' })
  const [sort, order] = f.sort.split(':')
  const list = useList<List>(['invoices', f, page], `/invoices${qs({ q: f.q, status: f.status, sort, order, page, pageSize: 25 })}`)
  const s = list.data?.summary

  const cols: Column<InvoiceRow>[] = [
    { key: 'n', header: 'Invoice', sort: 'number', cell: (i) => <Link to={`/app/invoices/${i.id}`} className="font-mono text-[12.5px] group-hover:underline">{i.number}</Link> },
    { key: 'c', header: 'Customer', cell: (i) => <span className="block max-w-[240px] truncate">{i.customer.name}</span> },
    { key: 'd', header: 'Issued', sort: 'issueDate', hide: 'md', cell: (i) => <span className="tnum text-stone-600">{shortDate(i.issueDate)}</span> },
    { key: 'due', header: 'Due', sort: 'dueDate', cell: (i) => <Aging i={i} /> },
    { key: 's', header: 'Status', cell: (i) => <Status kind="invoice" status={i.status} overdue={i.overdue} /> },
    { key: 't', header: 'Total', align: 'right', sort: 'total', hide: 'sm', cell: (i) => <span className="font-mono text-[12.5px] text-stone-600">{inr(i.total)}</span> },
    { key: 'o', header: 'Outstanding', align: 'right', cell: (i) => <span className={`font-mono text-[12.5px] ${i.outstanding > 0 ? 'font-medium' : 'text-stone-500'}`}>{i.outstanding > 0 ? inr(i.outstanding) : '—'}</span> },
  ]

  return (
    <div>
      <PageHeader eyebrow="Receivables" title={<>Invoices <span className="font-serif font-normal italic">&amp; dues.</span></>}>
        Issued from orders, priced from the order’s own lines. Outstanding is the invoice total minus recorded payments.
      </PageHeader>
      <Figures items={[
        { label: 'Outstanding', value: s ? lakh(s.outstanding) : '—', note: s ? `${s.openCount} open invoices` : undefined },
        { label: 'Overdue', value: s ? lakh(s.overdue) : '—', note: s ? `${s.overdueCount} past the due date` : undefined, accent: !!s?.overdueCount },
        { label: 'Collected · 30 days', value: s ? lakh(s.collected30) : '—', note: 'recorded payments' },
      ]} />
      <div className={toolbar}>
        <Tabs id="inv" value={f.status} onChange={(v) => set({ status: v, page: 1 })} options={[
          { value: 'ALL', label: 'All' }, { value: 'OPEN', label: 'Open', count: s?.openCount }, { value: 'OVERDUE', label: 'Overdue', count: s?.overdueCount },
          { value: 'PARTIALLY_PAID', label: 'Partly paid' }, { value: 'PAID', label: 'Paid' }, { value: 'VOID', label: 'Void' },
        ]} />
        <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Invoice number or customer" />
      </div>
      <div className={`mt-2 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
        <DataTable caption="Invoices" rows={list.data?.items} columns={cols} loading={list.isLoading}
          sort={{ key: sort, order: order as 'asc' | 'desc' }} onSort={(k) => set({ sort: `${k}:${k === sort && order === 'desc' ? 'asc' : 'desc'}`, page: 1 })}
          onRowClick={(i) => navigate(`/app/invoices/${i.id}`)}
          empty={<EmptyState title={f.status !== 'ALL' || f.q ? 'No invoices match' : 'No invoices yet'} body="Issue an invoice from a confirmed or completed sales order." />} />
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
    </div>
  )
}
