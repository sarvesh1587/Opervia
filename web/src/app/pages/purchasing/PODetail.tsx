import { motion } from 'framer-motion'
import { PackageCheck, Pencil, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog, Dialog } from '../../../components/ui/dialog'
import { ErrorState, FormError, Input, PageHeader, Status } from '../../../components/ui/kit'
import { Button, EASE, Skeleton } from '../../../components/ui/primitives'
import { idemKey, useAction, useDetail } from '../../../hooks/data'
import { http } from '../../../lib/api'
import { inr, shortDate, time } from '../../../lib/format'
import type { PurchaseOrder } from '../../../lib/types'
import { useAuth } from '../../auth'
import POForm from './POForm'

function ReceiveDialog({ po, open, onClose }: { po: PurchaseOrder; open: boolean; onClose: () => void }) {
  const open_ = po.items.filter((i) => i.receivedQty < i.quantity)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const key = useMemo(() => (open ? idemKey() : ''), [open])
  useEffect(() => { if (open) { setQty(Object.fromEntries(open_.map((i) => [i.id, i.quantity - i.receivedQty]))); setNote('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = useAction(() => http.post<PurchaseOrder>(`/purchase-orders/${po.id}/receive`, { items: Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity })), note: note || undefined }, { idempotencyKey: key }), {
    invalidate: [['po', po.id], ['purchase-orders'], ['products'], ['overview']],
    success: (r) => (r.status === 'RECEIVED' ? `${po.number} fully received` : `Receipt recorded on ${po.number}`),
    onSuccess: onClose,
  })
  const units = Object.values(qty).reduce((s, q) => s + (q || 0), 0)
  const over = open_.some((i) => (qty[i.id] ?? 0) > i.quantity - i.receivedQty)
  return (
    <Dialog open={open} onClose={onClose} title={`Receive ${po.number}`} description={`Count what arrived from ${po.supplier.name}. Stock rises only by what you enter here.`} width={620}>
      <div className="label flex border-b border-ink-950 pb-2 text-stone-600"><span className="flex-1">Product</span><span className="w-24 text-right">Remaining</span><span className="w-28 text-right">Arrived now</span></div>
      <ul>
        {open_.map((i) => {
          const rem = i.quantity - i.receivedQty
          const bad = (qty[i.id] ?? 0) > rem
          return (
            <li key={i.id} className="flex items-center gap-2 border-b border-paper-200 py-2.5">
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{i.product.name}</span><span className="font-mono text-[11px] text-stone-500">{i.product.sku} · {i.receivedQty} of {i.quantity} received</span></span>
              <span className="tnum w-24 text-right font-mono text-[13px] text-stone-600">{rem}</span>
              <label htmlFor={`rcv-${i.id}`} className="sr-only">Units of {i.product.name} arrived</label>
              <input id={`rcv-${i.id}`} type="number" min={0} max={rem} inputMode="numeric" value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.floor(Number(e.target.value))) })}
                className={`tnum h-9 w-28 rounded-[6px] border bg-paper-50 px-2 text-right font-mono text-[13px] outline-none focus:border-ink-950 ${bad ? 'border-ink-950' : 'border-paper-300'}`} aria-invalid={bad} />
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex gap-2 text-[12.5px]">
        <button className="link-underline" onClick={() => setQty(Object.fromEntries(open_.map((i) => [i.id, i.quantity - i.receivedQty])))}>Everything remaining</button>
        <span className="text-stone-400">·</span>
        <button className="link-underline" onClick={() => setQty(Object.fromEntries(open_.map((i) => [i.id, 0])))}>Clear</button>
      </div>
      <label htmlFor="rcv-note" className="label mt-6 block text-stone-600">Note</label>
      <Input id="rcv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery challan number, damage noted…" className="mt-2" />
      {over && <p role="alert" className="mt-3 text-[13px]">You can’t receive more than what remains on a line.</p>}
      <FormError error={act.error} />
      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="tnum font-mono text-[12.5px] text-stone-600">{units} units into stock</span>
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || units === 0 || over}>{act.isPending ? 'Recording…' : 'Record receipt'}</Button></div>
      </div>
    </Dialog>
  )
}

export default function PODetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const q = useDetail<PurchaseOrder>(['po', id], `/purchase-orders/${id}`)
  const [editing, setEditing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [cancel, setCancel] = useState(false)
  const submit = useAction(() => http.post(`/purchase-orders/${id}/submit`), { invalidate: [['po', id], ['purchase-orders']], success: 'Purchase order sent to the supplier' })
  const doCancel = useAction(() => http.post(`/purchase-orders/${id}/cancel`, {}), { invalidate: [['po', id], ['purchase-orders']], success: 'Purchase order cancelled', onSuccess: () => setCancel(false) })

  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-4 w-40" /><Skeleton className="h-14 w-72" /><Skeleton className="h-72 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const po = q.data
  const ordered = po.items.reduce((s, i) => s + i.quantity, 0), received = po.items.reduce((s, i) => s + i.receivedQty, 0)
  const canReceive = can('purchaseOrders:receive') && ['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)

  return (
    <div>
      <PageHeader eyebrow={`Purchase order · ${po.supplier.name}`} title={<span className="font-mono tracking-[-0.04em]">{po.number}</span>}
        actions={<>
          {po.status === 'DRAFT' && can('purchaseOrders:write') && <><Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</Button><Button onClick={() => submit.mutate(undefined)} disabled={submit.isPending}><Send className="h-4 w-4" />{submit.isPending ? 'Sending…' : 'Mark as sent'}</Button></>}
          {canReceive && <Button onClick={() => setReceiving(true)}><PackageCheck className="h-4 w-4" />Receive goods</Button>}
          {['DRAFT', 'ORDERED'].includes(po.status) && received === 0 && can('purchaseOrders:write') && <Button variant="ghost" onClick={() => setCancel(true)}>Cancel</Button>}
        </>}>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1"><Status kind="po" status={po.status} />{po.expectedAt && <span>expected {shortDate(po.expectedAt)}</span>}{po.createdBy && <span>by {po.createdBy.name}</span>}</span>
      </PageHeader>

      <section aria-label="Receiving progress" className="grid gap-6 border-b border-paper-300 px-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-7">
        <div>
          <div className="label text-stone-600">Received · {received} of {ordered} units</div>
          <div className="mt-3 h-3 w-full bg-paper-200 ring-1 ring-inset ring-paper-300">
            <motion.div className="h-full bg-ink-950" initial={{ width: 0 }} animate={{ width: `${ordered ? (received / ordered) * 100 : 0}%` }} transition={{ duration: 0.8, ease: EASE }} />
          </div>
        </div>
        <dl className="flex gap-8">
          <div><dt className="label text-stone-600">Total</dt><dd className="tnum mt-1 font-serif text-[34px] leading-none">{inr(po.total)}</dd></div>
        </dl>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 border-paper-300 px-4 py-8 md:px-7 lg:border-r">
          <h2 className="font-serif text-[26px] leading-none">Lines</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <caption className="sr-only">Purchase order lines</caption>
              <thead><tr className="label border-b border-ink-950 text-left text-stone-600">{['Product', 'Ordered', 'Received', 'Unit cost', 'Amount'].map((h, i) => <th key={h} scope="col" className={`pb-2.5 font-normal ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {po.items.map((i) => (
                  <tr key={i.id} className="border-b border-paper-200">
                    <td className="py-3"><Link to={`/app/inventory/${i.productId}`} className="hover:underline">{i.product.name}</Link><span className="block font-mono text-[11px] text-stone-500">{i.product.sku}</span></td>
                    <td className="tnum py-3 text-right font-mono">{i.quantity}</td>
                    <td className={`tnum py-3 text-right font-mono ${i.receivedQty === i.quantity ? '' : 'text-stone-600'}`}>{i.receivedQty}{i.receivedQty === i.quantity && ' ✓'}</td>
                    <td className="tnum py-3 text-right font-mono text-stone-600">{inr(i.unitCost)}</td>
                    <td className="tnum py-3 text-right font-mono">{inr(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-5 max-w-xs font-mono text-[13px]">
            <div className="flex justify-between py-1.5"><dt className="text-stone-600">Subtotal</dt><dd className="tnum">{inr(po.subtotal)}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-stone-600">Tax</dt><dd className="tnum">{inr(po.taxAmount)}</dd></div>
            <div className="flex justify-between border-t border-ink-950 pt-2 text-[14px]"><dt>Total</dt><dd className="tnum font-medium">{inr(po.total)}</dd></div>
          </dl>
        </section>
        <aside className="px-4 py-8 md:px-7">
          <h2 className="font-serif text-[26px] leading-none">Receipts</h2>
          {po.receipts?.length ? (
            <ol className="mt-5 border-l border-ink-950">
              {po.receipts.map((r) => (
                <li key={r.id} className="relative pb-4 pl-4">
                  <span className="absolute -left-[4px] top-[5px] h-[7px] w-[7px] bg-ink-950" aria-hidden="true" />
                  <div className="tnum font-mono text-[11px] text-stone-500">{shortDate(r.createdAt)} {time(r.createdAt)} · {r.user?.name ?? 'System'}</div>
                  <p className="mt-1 text-[13.5px]">+{r.quantity} {r.product.name}</p>
                  {r.note && <p className="text-[12.5px] text-stone-600">{r.note}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="mt-5 border-t border-ink-950 pt-3 text-[14px] text-stone-500">Nothing received yet.</p>}
          <h2 className="mt-10 font-serif text-[26px] leading-none">Supplier</h2>
          <div className="mt-5 border-t border-ink-950 pt-3 text-[14px]">
            <Link to={`/app/suppliers/${po.supplier.id}`} className="font-medium link-underline">{po.supplier.name}</Link>
            <div className="mt-1 text-stone-600">{[po.supplier.email, po.supplier.phone].filter(Boolean).join(' · ')}</div>
          </div>
          {po.notes && <><h2 className="mt-10 font-serif text-[26px] leading-none">Notes</h2><p className="mt-5 border-t border-ink-950 pt-3 text-[14px]">{po.notes}</p></>}
        </aside>
      </div>
      <POForm open={editing} onClose={() => setEditing(false)} po={po} />
      <ReceiveDialog po={po} open={receiving} onClose={() => setReceiving(false)} />
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} onConfirm={() => doCancel.mutate(undefined)} pending={doCancel.isPending} title={`Cancel ${po.number}?`} confirmLabel="Cancel purchase order" body="Nothing has been received, so stock is unaffected. Let the supplier know separately." />
    </div>
  )
}
