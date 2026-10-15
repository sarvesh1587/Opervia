import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Dialog } from '../../../components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { toast } from '../../../components/ui/toast'
import LineEditor, { type Line } from '../../../components/LineEditor'
import { useSupplierOptions } from '../../../hooks/data'
import { ApiError, http } from '../../../lib/api'
import { inr } from '../../../lib/format'
import type { ProductDetail, PurchaseOrder } from '../../../lib/types'
import { useAuth } from '../../auth'

export default function POForm({ open, onClose, po, prefill, onSaved }: { open: boolean; onClose: () => void; po?: PurchaseOrder; prefill?: string[]; onSaved?: (p: PurchaseOrder) => void }) {
  const { business } = useAuth()
  const qc = useQueryClient()
  const sups = useSupplierOptions()
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({}); setError(null)
    setSupplierId(po?.supplier.id ?? '')
    setExpectedAt(po?.expectedAt?.slice(0, 10) ?? '')
    setNotes(po?.notes ?? '')
    setLines(po?.items.map((i) => ({ productId: i.productId, name: i.product.name, sku: i.product.sku, quantity: i.quantity, unitCost: i.unitCost, unitPrice: 0, stock: i.product.stockQty })) ?? [])
    if (!po && prefill?.length) {
      // Restock suggestions: order enough to reach three times the reorder level.
      Promise.all(prefill.map((pid) => http.get<ProductDetail>(`/products/${pid}`).catch(() => null))).then((ps) => {
        const valid = ps.filter((p): p is ProductDetail => !!p)
        setLines(valid.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, quantity: Math.max(p.reorderLevel * 3 - p.stockQty - p.incoming, p.reorderLevel, 1), unitCost: p.costPrice, unitPrice: p.sellingPrice, stock: p.stockQty })))
        const first = valid.find((p) => p.supplierId)?.supplierId
        if (first) setSupplierId(first)
      })
    }
  }, [open, po, prefill])

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
  const tax = Math.round(subtotal * business.taxRate) / 100

  const save = async () => {
    const e: Record<string, string> = {}
    if (!supplierId) e.supplierId = 'Choose a supplier'
    if (!lines.length) e.items = 'Add at least one product'
    else if (lines.some((l) => l.quantity < 1 || l.unitCost < 0)) e.items = 'Each line needs a quantity of at least 1 and a cost of ₹0 or more'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true); setError(null)
    try {
      const body = { supplierId, items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })), expectedAt: expectedAt || null, notes: notes || undefined }
      const saved = po ? await http.put<PurchaseOrder>(`/purchase-orders/${po.id}`, body) : await http.post<PurchaseOrder>('/purchase-orders', body)
      await qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      await qc.invalidateQueries({ queryKey: ['po', saved.id] })
      toast.success(po ? 'Draft updated' : `Draft ${saved.number} created`, 'Submit it when it is ready to send.')
      onSaved?.(saved); onClose()
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setError(err)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" width={680} title={po ? `Edit ${po.number}` : 'New purchase order'} description="Stock only changes when goods are received against the order.">
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-[1.5fr_1fr]">
          <Field id="po-supplier" label="Supplier" error={errors.supplierId}>
            <Select id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} invalid={!!errors.supplierId}>
              <option value="">{sups.isLoading ? 'Loading suppliers…' : 'Choose a supplier'}</option>
              {sups.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field id="po-expected" label="Expected delivery"><Input id="po-expected" type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></Field>
        </div>
        <div>
          <div className="label mb-3 text-stone-600">Lines</div>
          <LineEditor mode="purchase" lines={lines} onChange={setLines} error={errors.items} />
        </div>
        <dl className="ml-auto max-w-xs font-mono text-[12.5px]">
          <div className="flex justify-between py-1"><dt className="text-stone-600">Subtotal</dt><dd className="tnum">{inr(subtotal)}</dd></div>
          <div className="flex justify-between py-1"><dt className="text-stone-600">{business.taxLabel} {business.taxRate}%</dt><dd className="tnum">{inr(tax)}</dd></div>
          <div className="flex justify-between border-t border-ink-950 pt-2 text-[14px]"><dt>Estimated total</dt><dd className="tnum font-medium">{inr(subtotal + tax)}</dd></div>
        </dl>
        <Field id="po-notes" label="Notes for the supplier"><Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormError error={error && !(error instanceof ApiError && Object.keys(error.fieldErrors).length) ? error : null} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : po ? 'Save draft' : 'Create draft'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
