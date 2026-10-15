import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { z } from 'zod'
import { ConfirmDialog, Dialog } from '../../../components/ui/dialog'
import { ErrorState, Field, Figures, FormError, Input, PageHeader } from '../../../components/ui/kit'
import { Button, Skeleton } from '../../../components/ui/primitives'
import { idemKey, useAction, useDetail } from '../../../hooks/data'
import { http } from '../../../lib/api'
import { inr, shortDate, time } from '../../../lib/format'
import type { Movement, ProductDetail as P } from '../../../lib/types'
import { Can, useAuth } from '../../auth'
import ProductForm from './ProductForm'

const TYPE: Record<Movement['type'], string> = { OPENING: 'Opening', PURCHASE_RECEIPT: 'Received', SALE: 'Sold', SALE_CANCELLED: 'Sale cancelled', ADJUSTMENT: 'Adjusted' }

function refLink(ref: string | null) {
  if (!ref) return null
  if (/^SO-\d+/.test(ref)) return <Link to={`/app/orders?q=${ref}`} className="font-mono text-[12px] link-underline">{ref}</Link>
  if (/^PO-\d+/.test(ref)) return <Link to={`/app/purchase-orders?q=${ref}`} className="font-mono text-[12px] link-underline">{ref}</Link>
  return <span className="text-stone-600">{ref}</span>
}

const adjustSchema = z.object({
  direction: z.enum(['add', 'remove']),
  quantity: z.coerce.number({ message: 'Enter a quantity' }).int('Whole units only').min(1, 'At least 1'),
  note: z.string().trim().min(3, 'Say why, e.g. “3 damaged in transit”').max(200),
})

function AdjustDialog({ product, open, onClose }: { product: P; open: boolean; onClose: () => void }) {
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<z.input<typeof adjustSchema>, unknown, z.output<typeof adjustSchema>>({ resolver: zodResolver(adjustSchema), defaultValues: { direction: 'remove', quantity: 1, note: '' } })
  const key = useMemo(() => (open ? idemKey() : ''), [open])
  const act = useAction((v: z.output<typeof adjustSchema>) => http.post(`/products/${product.id}/adjust`, { quantity: v.direction === 'add' ? v.quantity : -v.quantity, note: v.note }, { idempotencyKey: key }),
    { success: 'Stock adjusted', invalidate: [['product', product.id], ['products']], onSuccess: () => { reset(); onClose() } })
  const q = Number(watch('quantity')) || 0, dir = watch('direction')
  const after = dir === 'add' ? product.stockQty + q : product.stockQty - q
  return (
    <Dialog open={open} onClose={onClose} title="Adjust stock" description="For counts, damage or returns. Every adjustment is recorded with your name and reason.">
      <form onSubmit={handleSubmit((v) => act.mutate(v))} noValidate className="space-y-5">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="label mb-2 text-stone-600">Direction</legend>
          {(['remove', 'add'] as const).map((d) => (
            <label key={d} className={`flex cursor-pointer items-center gap-2.5 rounded-[8px] border px-3 py-3 text-[14px] transition-colors ${dir === d ? 'border-ink-950 bg-paper-100' : 'border-paper-300 hover:border-stone-500'}`}>
              <input type="radio" value={d} {...register('direction')} className="accent-ink-950" />{d === 'add' ? 'Add units' : 'Remove units'}
            </label>
          ))}
        </fieldset>
        <Field id="adj-q" label="Quantity" error={errors.quantity?.message}><Input id="adj-q" type="number" inputMode="numeric" {...register('quantity')} invalid={!!errors.quantity} className="tnum" /></Field>
        <Field id="adj-note" label="Reason" error={errors.note?.message}><Input id="adj-note" {...register('note')} invalid={!!errors.note} placeholder="Annual stock count" /></Field>
        <div className="flex items-center justify-between border-y border-paper-300 py-3 font-mono text-[12.5px]">
          <span className="text-stone-600">On hand after</span>
          <span className={after < 0 ? 'font-medium' : ''}>{product.stockQty} → {after}{after < 0 && ' · not possible'}</span>
        </div>
        <FormError error={act.error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={act.isPending || after < 0}>{act.isPending ? 'Saving…' : 'Record adjustment'}</Button></div>
      </form>
    </Dialog>
  )
}

export default function ProductDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const q = useDetail<P>(['product', id], `/products/${id}`)
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const archive = useAction(() => http.post(`/products/${id}/${q.data?.status === 'ARCHIVED' ? 'restore' : 'archive'}`), { success: q.data?.status === 'ARCHIVED' ? 'Product restored' : 'Product archived', invalidate: [['product', id], ['products']], onSuccess: () => setConfirm(null) })
  const del = useAction(() => http.del(`/products/${id}`), { success: 'Product deleted', invalidate: [['products']], onSuccess: () => navigate('/app/inventory') })

  const chart = useMemo(() => [...(q.data?.movements ?? [])].reverse().map((m) => ({ t: new Date(m.createdAt).getTime(), balance: m.balanceAfter })), [q.data])

  if (q.isLoading) return <div className="space-y-4 px-7 py-10"><Skeleton className="h-4 w-40" /><Skeleton className="h-14 w-[420px] max-w-full" /><Skeleton className="h-64 w-full" /></div>
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const p = q.data
  const unitMargin = p.sellingPrice - p.costPrice

  return (
    <div>
      <PageHeader eyebrow={`${p.sku} · ${p.category?.name ?? 'Uncategorised'}${p.status === 'ARCHIVED' ? ' · archived' : ''}`} title={p.name}
        actions={<>
          <Can permission="products:adjust"><Button variant="secondary" onClick={() => setAdjusting(true)} disabled={p.status === 'ARCHIVED'}><SlidersHorizontal className="h-4 w-4" />Adjust stock</Button></Can>
          <Can permission="products:write">
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</Button>
            <Button variant="ghost" onClick={() => setConfirm('archive')} aria-label={p.status === 'ARCHIVED' ? 'Restore product' : 'Archive product'}>{p.status === 'ARCHIVED' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
            <Button variant="ghost" onClick={() => setConfirm('delete')} aria-label="Delete product"><Trash2 className="h-4 w-4" /></Button>
          </Can>
        </>}>
        {p.description}
      </PageHeader>
      <Figures items={[
        { label: 'On hand', value: p.stockQty, note: `reorder at ${p.reorderLevel}`, accent: p.state !== 'ok' },
        { label: 'Days of cover', value: p.stockQty === 0 ? 'Out' : p.coverDays ?? '—', note: `${p.dailySales} sold per day` },
        { label: 'Sold · 30 days', value: p.sold30, note: 'confirmed orders' },
        { label: 'Incoming', value: p.incoming, note: 'on open purchase orders' },
      ]} />

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="hist" className="min-w-0 border-paper-300 px-4 py-8 md:px-7 lg:border-r">
          <div className="flex items-baseline justify-between">
            <h2 id="hist" className="font-serif text-[26px] leading-none">Stock history</h2>
            <span className="label text-stone-500">last {p.movements.length} movements</span>
          </div>
          <div className="mt-5 h-[220px]" role="img" aria-label={`Stock balance over time, now ${p.stockQty} units`}>
            {chart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs><linearGradient id="bal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CDF545" stopOpacity={0.55} /><stop offset="100%" stopColor="#CDF545" stopOpacity={0.08} /></linearGradient></defs>
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => shortDate(new Date(t).toISOString())} tick={{ fontSize: 10, fontFamily: 'Geist Mono Variable', fill: '#77736A' }} axisLine={{ stroke: '#0B0C0E' }} tickLine={false} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Geist Mono Variable', fill: '#77736A' }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                  <ReferenceLine y={p.reorderLevel} stroke="#77736A" strokeDasharray="3 4" label={{ value: 'reorder', position: 'insideTopRight', fontSize: 10, fill: '#77736A', fontFamily: 'Geist Mono Variable' }} />
                  <Tooltip cursor={{ stroke: '#0B0C0E' }} contentStyle={{ background: '#0B0C0E', border: 0, borderRadius: 6, color: '#F7F5F0', fontSize: 12 }} labelFormatter={(t) => `${shortDate(new Date(Number(t)).toISOString())} ${time(new Date(Number(t)).toISOString())}`} formatter={(v) => [`${v} units`, 'Balance']} />
                  <Area type="stepAfter" dataKey="balance" stroke="#0B0C0E" strokeWidth={1.75} fill="url(#bal)" animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="pt-10 text-[14px] text-stone-500">Not enough movements to draw a history yet.</p>}
          </div>

          <h3 className="label mt-8 border-b border-ink-950 pb-2 text-stone-600">Movement ledger</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <caption className="sr-only">Stock movements</caption>
              <thead><tr className="label text-left text-stone-600">{['When', 'Movement', 'Reference', 'Change', 'Balance', 'By'].map((h, i) => <th key={h} scope="col" className={`py-2.5 font-normal ${i === 3 || i === 4 ? 'text-right' : ''} ${i === 5 ? 'hidden pl-4 sm:table-cell' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {p.movements.map((m) => (
                  <tr key={m.id} className="border-t border-paper-200 hover:bg-paper-100">
                    <td className="tnum py-2.5 font-mono text-[12px] text-stone-600">{shortDate(m.createdAt)} {time(m.createdAt)}</td>
                    <td className="py-2.5">{TYPE[m.type]}{m.note && <span className="block text-[12px] text-stone-500">{m.note}</span>}</td>
                    <td className="py-2.5">{refLink(m.reference)}</td>
                    <td className={`tnum py-2.5 text-right font-mono text-[12.5px] ${m.quantity > 0 ? 'font-medium' : 'text-stone-600'}`}>{m.quantity > 0 ? `+${m.quantity}` : `−${Math.abs(m.quantity)}`}</td>
                    <td className="tnum py-2.5 text-right font-mono text-[12.5px]">{m.balanceAfter}</td>
                    <td className="hidden py-2.5 pl-4 text-stone-600 sm:table-cell">{m.user?.name ?? 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="px-4 py-8 md:px-7">
          <h2 className="font-serif text-[26px] leading-none">Pricing</h2>
          <dl className="mt-5 border-t border-ink-950 text-[14px]">
            <div className="flex justify-between border-b border-paper-200 py-3"><dt className="text-stone-600">Selling price</dt><dd className="tnum font-mono">{inr(p.sellingPrice)}</dd></div>
            {can('analytics:read') && <>
              <div className="flex justify-between border-b border-paper-200 py-3"><dt className="text-stone-600">Cost price</dt><dd className="tnum font-mono">{inr(p.costPrice)}</dd></div>
              <div className="flex justify-between border-b border-paper-200 py-3"><dt className="text-stone-600">Margin per unit</dt><dd className="tnum font-mono">{inr(unitMargin)} · {p.sellingPrice ? ((unitMargin / p.sellingPrice) * 100).toFixed(1) : 0}%</dd></div>
              <div className="flex justify-between border-b border-paper-200 py-3"><dt className="text-stone-600">Stock at cost</dt><dd className="tnum font-mono">{inr(p.stockQty * p.costPrice)}</dd></div>
            </>}
          </dl>
          <h2 className="mt-10 font-serif text-[26px] leading-none">Supplier</h2>
          <div className="mt-5 border-t border-ink-950 pt-3 text-[14px]">
            {p.supplier ? <Link to={`/app/suppliers/${p.supplier.id}`} className="link-underline">{p.supplier.name}</Link> : <span className="text-stone-500">No default supplier</span>}
          </div>
          <Can permission="purchaseOrders:write">
            {p.supplier && p.status === 'ACTIVE' && <Button variant="secondary" className="mt-5" onClick={() => navigate(`/app/purchase-orders?new=${p.id}`)}>Reorder from {p.supplier.name}</Button>}
          </Can>
          <p className="mt-10 font-mono text-[11px] text-stone-500">Updated {shortDate(p.updatedAt)} · created {shortDate(p.createdAt)}</p>
        </aside>
      </div>

      <ProductForm open={editing} onClose={() => setEditing(false)} product={p} />
      <AdjustDialog product={p} open={adjusting} onClose={() => setAdjusting(false)} />
      <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} onConfirm={() => archive.mutate(undefined)} pending={archive.isPending}
        title={p.status === 'ARCHIVED' ? 'Restore this product?' : 'Archive this product?'} confirmLabel={p.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        body={p.status === 'ARCHIVED' ? 'It will appear in lists and can be sold and ordered again.' : 'It disappears from active lists and can’t be sold or ordered. Its order and stock history stays intact.'} />
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={() => del.mutate(undefined)} pending={del.isPending}
        title="Delete this product?" confirmLabel="Delete permanently"
        body="This only works for products that were never ordered, received or sold. Anything with history must be archived instead." />
    </div>
  )
}
