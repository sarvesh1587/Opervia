import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ui/dialog'
import { ErrorState, Figures, PageHeader, Status } from '../../../components/ui/kit'
import { Button, Skeleton } from '../../../components/ui/primitives'
import { useAction, useDetail } from '../../../hooks/data'
import { http } from '../../../lib/api'
import { inr, lakh, shortDate } from '../../../lib/format'
import type { CustomerDetail, SupplierDetail } from '../../../lib/types'
import { useAuth } from '../../auth'
import PartyForm from './PartyForm'

function Contact({ p }: { p: { contactName: string | null; email: string | null; phone: string | null; address: string | null; gstin: string | null } }) {
  const rows = [['Contact', p.contactName], ['Email', p.email], ['Phone', p.phone], ['GSTIN', p.gstin], ['Address', p.address]].filter(([, v]) => v)
  return (
    <dl className="mt-5 border-t border-ink-950 text-[14px]">
      {rows.length ? rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 border-b border-paper-200 py-3">
          <dt className="text-stone-600">{k}</dt><dd className={`break-words ${k === 'GSTIN' ? 'font-mono text-[13px]' : ''}`}>{v}</dd>
        </div>
      )) : <p className="pt-3 text-stone-500">No contact details yet.</p>}
    </dl>
  )
}

function Head({ kind, name, status, onEdit, onDelete }: { kind: string; name: string; status: string; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <PageHeader eyebrow={`${kind}${status === 'INACTIVE' ? ' · inactive' : ''}`} title={name}
      actions={<>{onEdit && <Button variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" />Edit</Button>}{onDelete && <Button variant="ghost" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}</>} />
  )
}

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const q = useDetail<CustomerDetail>(['customer', id], `/customers/${id}`)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const del = useAction(() => http.del(`/customers/${id}`), { success: 'Customer deleted', invalidate: [['customers']], onSuccess: () => navigate('/app/customers') })
  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-14 w-72" /><Skeleton className="h-64 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const c = q.data
  return (
    <div>
      <Head kind="Customer" name={c.name} status={c.status} onEdit={can('customers:write') ? () => setEditing(true) : undefined} onDelete={can('customers:write') ? () => setDeleting(true) : undefined} />
      <Figures items={[
        { label: 'Total purchases', value: lakh(c.totalPurchases), note: `${c.orderCount} orders` },
        { label: 'Outstanding', value: inr(c.outstanding), accent: c.outstanding > 0 },
        { label: 'Average order', value: c.orderCount ? inr(c.totalPurchases / c.orderCount) : '—' },
        { label: 'Last order', value: c.lastOrderAt ? shortDate(c.lastOrderAt) : '—' },
      ]} />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-paper-300 lg:border-r">
          <section className="px-4 py-8 md:px-7">
            <div className="flex items-baseline justify-between"><h2 className="font-serif text-[26px] leading-none">Orders</h2>{can('salesOrders:write') && c.status === 'ACTIVE' && <Link to="/app/orders?new=1" className="inline-flex items-center gap-1 text-[13px] link-underline"><Plus className="h-3.5 w-3.5" />New order</Link>}</div>
            <table className="mt-5 w-full text-[13.5px]">
              <caption className="sr-only">Recent orders</caption>
              <thead><tr className="label border-b border-ink-950 text-left text-stone-600"><th scope="col" className="pb-2.5 font-normal">Order</th><th scope="col" className="pb-2.5 font-normal">Placed</th><th scope="col" className="pb-2.5 font-normal">Status</th><th scope="col" className="pb-2.5 text-right font-normal">Total</th></tr></thead>
              <tbody>{c.salesOrders.map((o) => (
                <tr key={o.id} className="border-b border-paper-200 hover:bg-paper-100">
                  <td className="py-2.5"><Link to={`/app/orders/${o.id}`} className="font-mono text-[12.5px] link-underline">{o.number}</Link></td>
                  <td className="tnum py-2.5 text-stone-600">{shortDate(o.createdAt)}</td>
                  <td className="py-2.5"><Status kind="order" status={o.status} /></td>
                  <td className="tnum py-2.5 text-right font-mono text-[12.5px]">{inr(o.total)}</td>
                </tr>
              ))}</tbody>
            </table>
            {!c.salesOrders.length && <p className="py-6 text-stone-500">No orders yet.</p>}
          </section>
          <section className="border-t border-paper-300 px-4 py-8 md:px-7">
            <h2 className="font-serif text-[26px] leading-none">Invoices</h2>
            <table className="mt-5 w-full text-[13.5px]">
              <caption className="sr-only">Invoices</caption>
              <thead><tr className="label border-b border-ink-950 text-left text-stone-600"><th scope="col" className="pb-2.5 font-normal">Invoice</th><th scope="col" className="pb-2.5 font-normal">Due</th><th scope="col" className="pb-2.5 font-normal">Status</th><th scope="col" className="pb-2.5 text-right font-normal">Outstanding</th></tr></thead>
              <tbody>{c.invoices.map((i) => {
                const due = i.total - i.amountPaid
                const overdue = ['UNPAID', 'PARTIALLY_PAID'].includes(i.status) && new Date(i.dueDate) < new Date()
                return (
                  <tr key={i.id} className="border-b border-paper-200 hover:bg-paper-100">
                    <td className="py-2.5"><Link to={`/app/invoices/${i.id}`} className="font-mono text-[12.5px] link-underline">{i.number}</Link></td>
                    <td className="tnum py-2.5 text-stone-600">{shortDate(i.dueDate)}</td>
                    <td className="py-2.5"><Status kind="invoice" status={i.status} overdue={overdue} /></td>
                    <td className={`tnum py-2.5 text-right font-mono text-[12.5px] ${due > 0 ? 'font-medium' : 'text-stone-500'}`}>{due > 0 ? inr(due) : '—'}</td>
                  </tr>
                )
              })}</tbody>
            </table>
            {!c.invoices.length && <p className="py-6 text-stone-500">No invoices yet.</p>}
          </section>
        </div>
        <aside className="px-4 py-8 md:px-7"><h2 className="font-serif text-[26px] leading-none">Details</h2><Contact p={c} /></aside>
      </div>
      <PartyForm kind="customer" open={editing} onClose={() => setEditing(false)} party={c} />
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => del.mutate(undefined)} pending={del.isPending} title={`Delete ${c.name}?`} confirmLabel="Delete" body="Only customers without orders or invoices can be deleted. Otherwise, mark them inactive." />
    </div>
  )
}

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const q = useDetail<SupplierDetail>(['supplier', id], `/suppliers/${id}`)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const del = useAction(() => http.del(`/suppliers/${id}`), { success: 'Supplier deleted', invalidate: [['suppliers']], onSuccess: () => navigate('/app/suppliers') })
  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-14 w-72" /><Skeleton className="h-64 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const s = q.data
  const t = (st: string) => s.totals.find((x) => x.status === st)
  const onOrder = (t('ORDERED')?.value ?? 0) + (t('PARTIALLY_RECEIVED')?.value ?? 0)
  const low = s.products.filter((p) => p.stockQty <= p.reorderLevel)
  return (
    <div>
      <Head kind="Supplier" name={s.name} status={s.status} onEdit={can('suppliers:write') ? () => setEditing(true) : undefined} onDelete={can('suppliers:write') ? () => setDeleting(true) : undefined} />
      <Figures items={[
        { label: 'Products supplied', value: s.products.length, note: low.length ? `${low.length} below reorder` : 'all above reorder', accent: low.length > 0 },
        { label: 'On order', value: inr(onOrder), note: `${(t('ORDERED')?.count ?? 0) + (t('PARTIALLY_RECEIVED')?.count ?? 0)} open orders` },
        { label: 'Received to date', value: lakh(t('RECEIVED')?.value ?? 0), note: `${t('RECEIVED')?.count ?? 0} orders` },
      ]} />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-paper-300 lg:border-r">
          <section className="px-4 py-8 md:px-7">
            <div className="flex items-baseline justify-between"><h2 className="font-serif text-[26px] leading-none">Purchase history</h2>{can('purchaseOrders:write') && s.status === 'ACTIVE' && <Link to={low.length ? `/app/purchase-orders?new=${low.map((p) => p.id).join(',')}` : '/app/purchase-orders?new=1'} className="inline-flex items-center gap-1 text-[13px] link-underline"><Plus className="h-3.5 w-3.5" />{low.length ? `Reorder ${low.length} low items` : 'New purchase order'}</Link>}</div>
            <table className="mt-5 w-full text-[13.5px]">
              <caption className="sr-only">Purchase orders</caption>
              <thead><tr className="label border-b border-ink-950 text-left text-stone-600"><th scope="col" className="pb-2.5 font-normal">Order</th><th scope="col" className="pb-2.5 font-normal">Ordered</th><th scope="col" className="pb-2.5 font-normal">Status</th><th scope="col" className="pb-2.5 text-right font-normal">Total</th></tr></thead>
              <tbody>{s.purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b border-paper-200 hover:bg-paper-100">
                  <td className="py-2.5"><Link to={`/app/purchase-orders/${po.id}`} className="font-mono text-[12.5px] link-underline">{po.number}</Link></td>
                  <td className="tnum py-2.5 text-stone-600">{po.orderedAt ? shortDate(po.orderedAt) : 'Draft'}</td>
                  <td className="py-2.5"><Status kind="po" status={po.status} /></td>
                  <td className="tnum py-2.5 text-right font-mono text-[12.5px]">{inr(po.total)}</td>
                </tr>
              ))}</tbody>
            </table>
            {!s.purchaseOrders.length && <p className="py-6 text-stone-500">No purchase orders yet.</p>}
          </section>
          <section className="border-t border-paper-300 px-4 py-8 md:px-7">
            <h2 className="font-serif text-[26px] leading-none">Products</h2>
            <ul className="mt-5 border-t border-ink-950">
              {s.products.map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-paper-200 py-2.5 text-[13.5px]">
                  <Link to={`/app/inventory/${p.id}`} className="truncate hover:underline">{p.name} <span className="font-mono text-[11px] text-stone-500">{p.sku}</span></Link>
                  <span className={`tnum font-mono text-[12.5px] ${p.stockQty <= p.reorderLevel ? 'font-medium' : 'text-stone-600'}`}>{p.stockQty}/{p.reorderLevel}</span>
                  <span className="tnum font-mono text-[12.5px] text-stone-600">{inr(p.costPrice)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="px-4 py-8 md:px-7"><h2 className="font-serif text-[26px] leading-none">Details</h2><Contact p={s} /></aside>
      </div>
      <PartyForm kind="supplier" open={editing} onClose={() => setEditing(false)} party={s} />
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => del.mutate(undefined)} pending={del.isPending} title={`Delete ${s.name}?`} confirmLabel="Delete" body="Only suppliers without products or purchase orders can be deleted. Otherwise, mark them inactive." />
    </div>
  )
}
