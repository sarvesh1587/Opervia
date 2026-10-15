import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Dialog } from '../../../components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { toast } from '../../../components/ui/toast'
import LineEditor, { type Line } from '../../../components/LineEditor'
import { ApiError, http } from '../../../lib/api'
import { inr } from '../../../lib/format'
import type { CustomerRow, Page, SalesOrder } from '../../../lib/types'
import { useAuth } from '../../auth'

export default function OrderForm({ open, onClose, order, onSaved }: { open: boolean; onClose: () => void; order?: SalesOrder; onSaved?: (o: SalesOrder) => void }) {
  const { business } = useAuth()
  const qc = useQueryClient()
  const customers = useQuery({ queryKey: ['customers', 'options'], queryFn: () => http.get<Page<CustomerRow>>('/customers?pageSize=100&status=ACTIVE'), enabled: open, staleTime: 60_000 })
  const [customerId, setCustomerId] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({}); setError(null)
    setCustomerId(order?.customer.id ?? '')
    setLines(order?.items.map((i) => ({ productId: i.productId, name: i.product.name, sku: i.product.sku, quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitCost ?? 0, stock: i.product.stockQty })) ?? [])
    setDiscount(order?.discount ?? 0)
    setNotes(order?.notes ?? '')
  }, [open, order])

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const tax = Math.round((subtotal - discount) * business.taxRate) / 100
  const total = subtotal - discount + tax

  const save = async () => {
    const e: Record<string, string> = {}
    if (!customerId) e.customerId = 'Choose a customer'
    if (!lines.length) e.items = 'Add at least one product'
    else if (lines.some((l) => l.quantity < 1)) e.items = 'Every line needs a quantity of at least 1'
    if (discount < 0 || discount > subtotal) e.discount = 'Discount must be between ₹0 and the subtotal'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true); setError(null)
    try {
      const body = { customerId, items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), discount, notes: notes || undefined }
      const saved = order ? await http.put<SalesOrder>(`/sales-orders/${order.id}`, body) : await http.post<SalesOrder>('/sales-orders', body)
      await qc.invalidateQueries({ queryKey: ['orders'] })
      await qc.invalidateQueries({ queryKey: ['order', saved.id] })
      toast.success(order ? 'Draft updated' : `Draft ${saved.number} created`, 'Confirm it to reserve stock.')
      onSaved?.(saved); onClose()
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setError(err)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" width={680} title={order ? `Edit ${order.number}` : 'New sales order'} description="Prices come from the product records and are fixed when the draft is saved.">
      <div className="space-y-6">
        <Field id="so-customer" label="Customer" error={errors.customerId}>
          <Select id="so-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} invalid={!!errors.customerId}>
            <option value="">{customers.isLoading ? 'Loading customers…' : 'Choose a customer'}</option>
            {customers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div>
          <div className="label mb-3 text-stone-600">Lines</div>
          <LineEditor mode="sale" lines={lines} onChange={setLines} error={errors.items} />
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_1.4fr]">
          <Field id="so-discount" label="Discount (₹)" error={errors.discount}><Input id="so-discount" type="number" min={0} step="0.01" inputMode="decimal" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} className="tnum" invalid={!!errors.discount} /></Field>
          <dl className="self-end font-mono text-[12.5px]">
            <div className="flex justify-between py-1"><dt className="text-stone-600">Subtotal</dt><dd className="tnum">{inr(subtotal)}</dd></div>
            <div className="flex justify-between py-1"><dt className="text-stone-600">{business.taxLabel} {business.taxRate}%</dt><dd className="tnum">{inr(tax)}</dd></div>
            <div className="flex justify-between border-t border-ink-950 pt-2 text-[14px]"><dt>Estimated total</dt><dd className="tnum font-medium">{inr(total)}</dd></div>
          </dl>
        </div>
        <Field id="so-notes" label="Notes"><Textarea id="so-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, site contact…" /></Field>
        <p className="font-mono text-[11px] text-stone-500">The server recalculates every amount when you save.</p>
        <FormError error={error && !(error instanceof ApiError && Object.keys(error.fieldErrors).length) ? error : null} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : order ? 'Save draft' : 'Create draft'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
