import { motion } from 'framer-motion'
import { Download, IndianRupee } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dialog } from '../../../components/ui/dialog'
import { ErrorState, Field, FormError, Input, PageHeader, Select, Status } from '../../../components/ui/kit'
import { Button, EASE, Logo, Skeleton } from '../../../components/ui/primitives'
import { toast } from '../../../components/ui/toast'
import { idemKey, useAction, useDetail } from '../../../hooks/data'
import { ApiError, http } from '../../../lib/api'
import { inr, shortDate } from '../../../lib/format'
import type { Invoice } from '../../../lib/types'
import { useAuth } from '../../auth'

const METHODS = [['UPI', 'UPI'], ['BANK_TRANSFER', 'Bank transfer'], ['CASH', 'Cash'], ['CHEQUE', 'Cheque'], ['CARD', 'Card']] as const
const dmy = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function PaymentDialog({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState('UPI')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const key = useMemo(() => (open ? idemKey() : ''), [open])
  useEffect(() => { if (open) { setAmount(inv.outstanding); setReference(''); setPaidAt(new Date().toISOString().slice(0, 10)) } }, [open, inv.outstanding])
  const act = useAction(() => http.post<Invoice>(`/invoices/${inv.id}/payments`, { amount, method, reference: reference || undefined, paidAt }, { idempotencyKey: key }), {
    invalidate: [['invoice', inv.id], ['invoices'], ['overview']], success: (r) => (r.status === 'PAID' ? `${inv.number} paid in full` : `Payment recorded · ${inr(r.outstanding)} still due`), onSuccess: onClose,
  })
  const tooMuch = amount > inv.outstanding + 0.001
  return (
    <Dialog open={open} onClose={onClose} title={`Record a payment on ${inv.number}`} description={<>Demo workspace bookkeeping only — no money moves. Outstanding <span className="tnum font-mono">{inr(inv.outstanding)}</span>.</>} width={480}>
      <div className="space-y-5">
        <Field id="pay-amt" label="Amount (₹)" error={tooMuch ? `Cannot exceed ${inr(inv.outstanding)}` : undefined}>
          <Input id="pay-amt" type="number" step="0.01" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="tnum font-mono text-[18px]" invalid={tooMuch} />
        </Field>
        <div className="flex gap-2 text-[12.5px]">
          {[1, 0.5, 0.25].map((f) => <button key={f} type="button" onClick={() => setAmount(Math.round(inv.outstanding * f * 100) / 100)} className="rounded-full border border-paper-300 px-3 py-1 hover:border-ink-950">{f === 1 ? 'Full balance' : `${f * 100}%`}</button>)}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="pay-method" label="Method"><Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field id="pay-date" label="Paid on"><Input id="pay-date" type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        </div>
        <Field id="pay-ref" label="Reference" hint="UTR, cheque number or receipt"><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <FormError error={act.error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || amount <= 0 || tooMuch}>{act.isPending ? 'Recording…' : `Record ${inr(amount)}`}</Button></div>
      </div>
    </Dialog>
  )
}

function VoidDialog({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const act = useAction(() => http.post(`/invoices/${inv.id}/void`, { reason }), { invalidate: [['invoice', inv.id], ['invoices']], success: `${inv.number} voided`, onSuccess: onClose })
  return (
    <Dialog open={open} onClose={onClose} title={`Void ${inv.number}?`} description="The invoice stays on record marked void. Only unpaid invoices can be voided." width={460}>
      <Field id="void-reason" label="Reason"><Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Issued against the wrong order" /></Field>
      <FormError error={act.error} />
      <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Keep invoice</Button><Button onClick={() => act.mutate(undefined)} disabled={act.isPending || reason.trim().length < 3}>Void invoice</Button></div>
    </Dialog>
  )
}

export default function InvoiceDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const q = useDetail<Invoice>(['invoice', id], `/invoices/${id}`)
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [downloading, setDownloading] = useState(false)

  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-4 w-40" /><Skeleton className="h-14 w-72" /><Skeleton className="h-[520px] w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const inv = q.data
  const open = ['UNPAID', 'PARTIALLY_PAID'].includes(inv.status)
  const download = async () => {
    setDownloading(true)
    try { await http.download(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`) } catch (e) { toast.error(e instanceof ApiError ? e.message : 'The PDF could not be generated.') } finally { setDownloading(false) }
  }

  return (
    <div>
      <PageHeader eyebrow={`Invoice · ${inv.customer.name}`} title={<span className="font-mono tracking-[-0.04em]">{inv.number}</span>}
        actions={<>
          <Button variant="secondary" onClick={download} disabled={downloading}><Download className="h-4 w-4" />{downloading ? 'Preparing…' : 'Download PDF'}</Button>
          {open && can('payments:write') && <Button onClick={() => setPaying(true)}><IndianRupee className="h-4 w-4" />Record payment</Button>}
          {inv.status === 'UNPAID' && inv.payments.length === 0 && can('invoices:write') && <Button variant="ghost" onClick={() => setVoiding(true)}>Void</Button>}
        </>}>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1"><Status kind="invoice" status={inv.status} overdue={inv.overdue} /><span>from order <Link to={`/app/orders/${inv.salesOrder.id}`} className="font-mono link-underline">{inv.salesOrder.number}</Link></span></span>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-paper-100 px-4 py-10 md:px-10 lg:border-r lg:border-paper-300">
          <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} aria-label="Invoice document"
            className="mx-auto max-w-[760px] bg-paper-50 p-6 shadow-[0_1px_0_rgb(11_12_14/0.06),0_30px_60px_-36px_rgb(11_12_14/0.35)] ring-1 ring-paper-300 md:p-12">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div><Logo /><div className="mt-3 text-[15px] font-medium">{inv.business.name}</div><div className="text-[13px] text-stone-600">{inv.business.city}</div></div>
              <div className="text-right"><div className="label text-stone-500">Tax invoice</div><div className="mt-1 font-mono text-[26px] tracking-[-0.03em]">{inv.number}</div></div>
            </div>
            <div className="mt-10 grid gap-6 border-t border-ink-950 pt-6 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div><div className="label text-stone-500">Billed to</div><div className="mt-2 font-medium">{inv.customer.name}</div><div className="mt-1 whitespace-pre-line text-[13px] text-stone-600">{[inv.customer.address, inv.customer.email, inv.customer.gstin && `GSTIN ${inv.customer.gstin}`].filter(Boolean).join('\n')}</div></div>
              <div><div className="label text-stone-500">Issued</div><div className="tnum mt-2 text-[14px]">{dmy(inv.issueDate)}</div></div>
              <div><div className="label text-stone-500">Due</div><div className={`tnum mt-2 text-[14px] ${inv.overdue ? 'font-medium' : ''}`}>{dmy(inv.dueDate)}{inv.overdue && <span className="block font-mono text-[11px]">{inv.daysOverdue} days overdue</span>}</div></div>
            </div>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13.5px]">
                <caption className="sr-only">Invoice lines</caption>
                <thead><tr className="label border-b border-ink-950 text-left text-stone-500">{['Item', 'Qty', 'Unit price', 'Amount'].map((h, i) => <th key={h} scope="col" className={`pb-2.5 font-normal ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {inv.items.map((i) => (
                    <tr key={i.id} className="border-b border-paper-200">
                      <td className="py-3">{i.description}<span className="block font-mono text-[11px] text-stone-500">{i.sku}</span></td>
                      <td className="tnum py-3 text-right font-mono">{i.quantity}</td>
                      <td className="tnum py-3 text-right font-mono text-stone-600">{inr(i.unitPrice)}</td>
                      <td className="tnum py-3 text-right font-mono">{inr(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-6 max-w-[300px] font-mono text-[13px]">
              <div className="flex justify-between py-1.5"><dt className="text-stone-600">Subtotal</dt><dd className="tnum">{inr(inv.subtotal)}</dd></div>
              {inv.discount > 0 && <div className="flex justify-between py-1.5"><dt className="text-stone-600">Discount</dt><dd className="tnum">−{inr(inv.discount)}</dd></div>}
              <div className="flex justify-between py-1.5"><dt className="text-stone-600">{inv.business.taxLabel} {inv.taxRate}%</dt><dd className="tnum">{inr(inv.taxAmount)}</dd></div>
              <div className="flex justify-between border-t border-ink-950 py-2.5 font-sans text-[15px] font-medium"><dt>Total</dt><dd className="tnum font-mono">{inr(inv.total)}</dd></div>
              {inv.amountPaid > 0 && <div className="flex justify-between py-1.5"><dt className="text-stone-600">Paid</dt><dd className="tnum">−{inr(inv.amountPaid)}</dd></div>}
              <div className={`mt-2 flex items-center justify-between px-3 py-2.5 font-sans ${inv.outstanding > 0 ? 'bg-lime' : 'bg-paper-200'}`}><dt className="font-medium">Balance due</dt><dd className="tnum font-mono text-[15px]">{inr(inv.outstanding)}</dd></div>
            </dl>
            <p className="mt-10 border-t border-paper-300 pt-4 text-[11.5px] leading-relaxed text-stone-500">Tax is calculated at the rate configured for this business. This is not a statement of compliance with any specific tax regulation.</p>
          </motion.article>
        </div>

        <aside className="px-4 py-8 md:px-7">
          <h2 className="font-serif text-[26px] leading-none">Balance</h2>
          <div className="mt-5 border-t border-ink-950 pt-4">
            <div className="tnum font-serif text-[48px] leading-none">{inr(inv.outstanding)}</div>
            <div className="mt-4 h-2 bg-paper-200"><motion.div className="h-full bg-ink-950" initial={{ width: 0 }} animate={{ width: `${(inv.amountPaid / inv.total) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} /></div>
            <div className="mt-2 flex justify-between font-mono text-[11.5px] text-stone-600"><span>Paid {inr(inv.amountPaid)}</span><span>of {inr(inv.total)}</span></div>
          </div>
          <h2 className="mt-10 font-serif text-[26px] leading-none">Payments</h2>
          {inv.payments.length ? (
            <ol className="mt-5 border-l border-ink-950">
              {inv.payments.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative pb-4 pl-4">
                  <span className="absolute -left-[4px] top-[5px] h-[7px] w-[7px] bg-lime ring-1 ring-ink-950" aria-hidden="true" />
                  <div className="flex justify-between gap-3"><span className="tnum font-mono text-[13px]">{inr(p.amount)}</span><span className="text-[12.5px] text-stone-600">{METHODS.find(([v]) => v === p.method)?.[1] ?? p.method}</span></div>
                  <div className="mt-0.5 font-mono text-[11px] text-stone-500">{shortDate(p.paidAt)}{p.reference && ` · ${p.reference}`}{p.user && ` · ${p.user.name}`}{p.isDemo && ' · demo'}</div>
                </motion.li>
              ))}
            </ol>
          ) : <p className="mt-5 border-t border-ink-950 pt-3 text-[14px] text-stone-500">No payments recorded.</p>}
          <h2 className="mt-10 font-serif text-[26px] leading-none">Customer</h2>
          <div className="mt-5 border-t border-ink-950 pt-3 text-[14px]"><Link to={`/app/customers/${inv.customer.id}`} className="font-medium link-underline">{inv.customer.name}</Link><div className="mt-1 text-stone-600">{[inv.customer.email, inv.customer.phone].filter(Boolean).join(' · ')}</div></div>
        </aside>
      </div>
      <PaymentDialog inv={inv} open={paying} onClose={() => setPaying(false)} />
      <VoidDialog inv={inv} open={voiding} onClose={() => setVoiding(false)} />
    </div>
  )
}
