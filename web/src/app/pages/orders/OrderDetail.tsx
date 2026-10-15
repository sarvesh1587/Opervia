import { motion } from 'framer-motion'
import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/ui/dialog'
import { ErrorState, PageHeader, Status } from '../../../components/ui/kit'
import { Arrow, Button, EASE, Skeleton } from '../../../components/ui/primitives'
import { idemKey, useAction, useDetail } from '../../../hooks/data'
import { http } from '../../../lib/api'
import { inr, shortDate, time } from '../../../lib/format'
import type { Invoice, OrderStatus, SalesOrder } from '../../../lib/types'
import { useAuth } from '../../auth'
import OrderForm from './OrderForm'

const STEPS: { s: OrderStatus; label: string; at: (o: SalesOrder) => string | null }[] = [
  { s: 'DRAFT', label: 'Drafted', at: (o) => o.createdAt },
  { s: 'CONFIRMED', label: 'Confirmed · stock reserved', at: (o) => o.confirmedAt },
  { s: 'PROCESSING', label: 'Processing', at: () => null },
  { s: 'COMPLETED', label: 'Completed', at: (o) => o.completedAt },
]
const order: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED']

function Lifecycle({ o }: { o: SalesOrder }) {
  const idx = o.status === 'CANCELLED' ? -1 : order.indexOf(o.status)
  return (
    <ol aria-label="Order lifecycle" className="grid grid-cols-2 border-b border-paper-300 md:grid-cols-4">
      {STEPS.map((st, i) => {
        const done = idx >= i, current = idx === i
        const at = st.at(o)
        return (
          <li key={st.s} className="relative border-paper-300 px-4 py-4 md:px-7 [&:not(:last-child)]:border-r" aria-current={current ? 'step' : undefined}>
            {current && <motion.span layoutId="lifecycle" className="absolute inset-x-0 top-0 h-[3px] bg-lime" transition={{ type: 'spring', stiffness: 400, damping: 36 }} />}
            <div className="flex items-center gap-2.5">
              <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[10.5px] ${done ? 'bg-ink-950 text-paper-50' : 'ring-1 ring-paper-300 text-stone-500'}`}>{i + 1}</span>
              <span className={`text-[13.5px] ${done ? 'text-ink-950' : 'text-stone-500'}`}>{st.label}</span>
            </div>
            <div className="mt-1.5 pl-[34px] font-mono text-[11px] text-stone-500">{done && at ? `${shortDate(at)} · ${time(at)}` : current ? 'in progress' : done ? 'done' : '—'}</div>
          </li>
        )
      })}
    </ol>
  )
}

type Act = 'confirm' | 'process' | 'complete' | 'cancel'

export default function OrderDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const q = useDetail<SalesOrder>(['order', id], `/sales-orders/${id}`)
  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const keys = useMemo(() => ({ confirm: idemKey(), cancel: idemKey() }), [q.data?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  const inval = [['order', id], ['orders'], ['products'], ['overview']]
  const act = useAction((a: Act) => http.post<SalesOrder>(`/sales-orders/${id}/${a}`, {}, { idempotencyKey: a === 'confirm' || a === 'cancel' ? keys[a] : undefined }), {
    invalidate: inval,
    success: (o) => ({ CONFIRMED: `${o.number} confirmed · stock reserved`, PROCESSING: `${o.number} is being processed`, COMPLETED: `${o.number} completed`, CANCELLED: `${o.number} cancelled${o.confirmedAt ? ' · stock returned' : ''}`, DRAFT: '' }[o.status]),
    onSuccess: () => setConfirmCancel(false),
  })
  const invoice = useAction(() => http.post<Invoice>('/invoices', { salesOrderId: id }), { invalidate: [['order', id], ['invoices'], ['orders']], success: (i) => `Invoice ${i.number} issued`, onSuccess: (i) => navigate(`/app/invoices/${i.id}`) })

  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-4 w-40" /><Skeleton className="h-14 w-72" /><Skeleton className="h-72 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const o = q.data
  const allowed = o.allowedTransitions
  const canCancel = allowed.includes('CANCELLED') && (o.status === 'DRAFT' || can('salesOrders:cancel')) && !(o.invoice && o.invoice.status !== 'VOID')
  const shortLines = o.status === 'DRAFT' ? o.items.filter((i) => i.quantity > i.product.stockQty) : []
  const margin = can('analytics:read') && o.items.every((i) => i.unitCost != null) ? o.items.reduce((s, i) => s + (i.unitPrice - (i.unitCost ?? 0)) * i.quantity, 0) - o.discount : null

  const primary = (() => {
    if (!can('salesOrders:write')) return null
    if (allowed.includes('CONFIRMED')) return <Button size="lg" onClick={() => act.mutate('confirm')} disabled={act.isPending}>{act.isPending ? 'Confirming…' : 'Confirm and reserve stock'} <Arrow /></Button>
    if (allowed.includes('PROCESSING')) return <><Button size="lg" onClick={() => act.mutate('process')} disabled={act.isPending}>Start processing <Arrow /></Button><Button size="lg" variant="secondary" onClick={() => act.mutate('complete')} disabled={act.isPending}>Mark completed</Button></>
    if (allowed.includes('COMPLETED')) return <Button size="lg" onClick={() => act.mutate('complete')} disabled={act.isPending}>Mark completed <Arrow /></Button>
    return null
  })()

  return (
    <div>
      <PageHeader eyebrow={`Sales order · ${o.createdBy ? `drafted by ${o.createdBy.name}` : 'drafted'} · ${shortDate(o.createdAt)}`} title={<span className="font-mono tracking-[-0.04em]">{o.number}</span>}
        actions={<>
          {o.status === 'DRAFT' && can('salesOrders:write') && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit draft</Button>}
          {canCancel && <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel order</Button>}
        </>}>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1"><Status kind="order" status={o.status} /><span>for <Link to={`/app/customers/${o.customer.id}`} className="link-underline text-ink-950">{o.customer.name}</Link></span></span>
      </PageHeader>
      {o.status === 'CANCELLED' ? (
        <div className="border-b border-paper-300 px-4 py-4 text-[14px] md:px-7"><span className="font-medium">Cancelled {o.cancelledAt && `${shortDate(o.cancelledAt)} · ${time(o.cancelledAt)}`}.</span> {o.confirmedAt ? 'Reserved stock was returned to inventory.' : 'It was never confirmed, so stock was not touched.'}</div>
      ) : <Lifecycle o={o} />}

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="lines-h" className="min-w-0 border-paper-300 px-4 py-8 md:px-7 lg:border-r">
          <h2 id="lines-h" className="font-serif text-[26px] leading-none">Lines</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <caption className="sr-only">Order lines</caption>
              <thead><tr className="label border-b border-ink-950 text-left text-stone-600">{['Product', 'Qty', 'Unit price', 'Amount'].map((h, i) => <th key={h} scope="col" className={`pb-2.5 font-normal ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {o.items.map((i, k) => (
                  <motion.tr key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: k * 0.03 }} className="border-b border-paper-200">
                    <td className="py-3"><Link to={`/app/inventory/${i.productId}`} className="hover:underline">{i.product.name}</Link><span className="block font-mono text-[11px] text-stone-500">{i.product.sku}{o.status === 'DRAFT' && ` · ${i.product.stockQty} in stock`}</span></td>
                    <td className="tnum py-3 text-right font-mono">{i.quantity}</td>
                    <td className="tnum py-3 text-right font-mono text-stone-600">{inr(i.unitPrice)}</td>
                    <td className="tnum py-3 text-right font-mono">{inr(i.lineTotal)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-5 max-w-sm font-mono text-[13px]">
            <div className="flex justify-between py-1.5"><dt className="text-stone-600">Subtotal</dt><dd className="tnum">{inr(o.subtotal)}</dd></div>
            {o.discount > 0 && <div className="flex justify-between py-1.5"><dt className="text-stone-600">Discount</dt><dd className="tnum">−{inr(o.discount)}</dd></div>}
            <div className="flex justify-between py-1.5"><dt className="text-stone-600">Tax {o.taxRate}%</dt><dd className="tnum">{inr(o.taxAmount)}</dd></div>
            <div className="mt-1 flex items-baseline justify-between border-t border-ink-950 pt-3"><dt className="font-sans text-[14px]">Total</dt><dd className="tnum font-serif text-[34px] leading-none">{inr(o.total)}</dd></div>
            {margin != null && <div className="flex justify-between pt-2 text-[12px] text-stone-500"><dt>Gross profit</dt><dd className="tnum">{inr(margin)}</dd></div>}
          </dl>
          {shortLines.length > 0 && (
            <p role="status" className="mt-6 border-l-2 border-ink-950 bg-paper-100 px-4 py-3 text-[13.5px]">
              Not enough stock for {shortLines.map((i) => `${i.product.name} (${i.product.stockQty} of ${i.quantity})`).join(', ')}. Confirming will be refused until stock is received or the quantity is reduced.
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {primary}
            {can('invoices:write') && !o.invoice && ['CONFIRMED', 'PROCESSING', 'COMPLETED'].includes(o.status) && (
              <Button size="lg" variant={primary ? 'secondary' : 'primary'} onClick={() => invoice.mutate(undefined)} disabled={invoice.isPending}>{invoice.isPending ? 'Issuing…' : 'Issue invoice'}</Button>
            )}
          </div>
        </section>

        <aside className="px-4 py-8 md:px-7">
          <h2 className="font-serif text-[26px] leading-none">Customer</h2>
          <div className="mt-5 border-t border-ink-950 pt-3 text-[14px]">
            <Link to={`/app/customers/${o.customer.id}`} className="font-medium link-underline">{o.customer.name}</Link>
            <div className="mt-1 text-stone-600">{[o.customer.email, o.customer.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <h2 className="mt-10 font-serif text-[26px] leading-none">Invoice</h2>
          <div className="mt-5 border-t border-ink-950 pt-3 text-[14px]">
            {o.invoice ? (
              <Link to={`/app/invoices/${o.invoice.id}`} className="flex items-center justify-between gap-3 hover:underline"><span className="font-mono">{o.invoice.number}</span><Status kind="invoice" status={o.invoice.status} /></Link>
            ) : <span className="text-stone-500">{['CONFIRMED', 'PROCESSING', 'COMPLETED'].includes(o.status) ? 'Not issued yet.' : 'Issued once the order is confirmed.'}</span>}
          </div>
          {o.notes && <><h2 className="mt-10 font-serif text-[26px] leading-none">Notes</h2><p className="mt-5 border-t border-ink-950 pt-3 text-[14px] text-stone-800">{o.notes}</p></>}
          <h2 className="mt-10 font-serif text-[26px] leading-none">History</h2>
          <ol className="mt-5 border-l border-ink-950">
            {(o.history ?? []).map((h, i) => (
              <motion.li key={h.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, ease: EASE }} className="relative pb-4 pl-4">
                <span className="absolute -left-[4px] top-[5px] h-[7px] w-[7px] bg-paper-50 ring-1 ring-ink-950" aria-hidden="true" />
                <div className="tnum font-mono text-[11px] text-stone-500">{shortDate(h.createdAt)} {time(h.createdAt)} · {h.user?.name ?? 'System'}</div>
                <p className="mt-1 text-[13.5px] leading-snug">{h.summary}</p>
              </motion.li>
            ))}
          </ol>
        </aside>
      </div>

      <OrderForm open={editing} onClose={() => setEditing(false)} order={o} />
      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={() => act.mutate('cancel')} pending={act.isPending} title={`Cancel ${o.number}?`} confirmLabel="Cancel order"
        body={o.stockApplied ? `The ${o.items.reduce((s, i) => s + i.quantity, 0)} reserved units go back into stock. This can’t be undone.` : 'The draft is closed. Stock was never reserved, so nothing else changes.'} />
    </div>
  )
}
