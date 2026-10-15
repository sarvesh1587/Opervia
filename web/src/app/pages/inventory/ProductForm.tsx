import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '../../../components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { toast } from '../../../components/ui/toast'
import { useCategories, useSupplierOptions } from '../../../hooks/data'
import { ApiError, http } from '../../../lib/api'
import { inr } from '../../../lib/format'
import type { Category, Product } from '../../../lib/types'

const schema = z.object({
  sku: z.string().trim().toUpperCase().min(2, 'At least 2 characters').max(32).regex(/^[A-Z0-9-_.]+$/, 'Letters, numbers, dashes or dots'),
  name: z.string().trim().min(2, 'Enter a product name').max(120),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  costPrice: z.coerce.number({ message: 'Enter a price' }).min(0, 'Cannot be negative').max(99_999_999),
  sellingPrice: z.coerce.number({ message: 'Enter a price' }).min(0, 'Cannot be negative').max(99_999_999),
  reorderLevel: z.coerce.number({ message: 'Enter a number' }).int('Whole units only').min(0, 'Cannot be negative'),
  openingStock: z.coerce.number().int('Whole units only').min(0, 'Cannot be negative').optional(),
  description: z.string().max(1000).optional(),
}).refine((v) => v.sellingPrice >= v.costPrice, { path: ['sellingPrice'], message: 'Selling price is below cost' })
type In = z.input<typeof schema>
type Out = z.output<typeof schema>

export default function ProductForm({ open, onClose, product, onSaved }: { open: boolean; onClose: () => void; product?: Product; onSaved?: (p: Product) => void }) {
  const qc = useQueryClient()
  const cats = useCategories()
  const sups = useSupplierOptions()
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState<unknown>(null)
  const { register, handleSubmit, reset, watch, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<In, unknown, Out>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!open) return
    setError(null)
    reset(product
      ? { sku: product.sku, name: product.name, categoryId: product.categoryId ?? '', supplierId: product.supplierId ?? '', costPrice: product.costPrice, sellingPrice: product.sellingPrice, reorderLevel: product.reorderLevel, description: product.description ?? '' }
      : { sku: '', name: '', categoryId: '', supplierId: '', costPrice: '' as unknown as number, sellingPrice: '' as unknown as number, reorderLevel: 10, openingStock: 0, description: '' })
  }, [open, product, reset])

  const cost = Number(watch('costPrice')) || 0, price = Number(watch('sellingPrice')) || 0
  const margin = price > 0 ? ((price - cost) / price) * 100 : null

  const addCategory = async () => {
    if (newCat.trim().length < 2) return
    try {
      const c = await http.post<Category>('/products/categories', { name: newCat.trim() })
      await qc.invalidateQueries({ queryKey: ['categories'] })
      setValue('categoryId', c.id); setNewCat('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not add the category') }
  }

  const submit = async (v: Out) => {
    setError(null)
    const body = { ...v, categoryId: v.categoryId || null, supplierId: v.supplierId || null, description: v.description || undefined, ...(product ? { openingStock: undefined } : {}) }
    try {
      const saved = product ? await http.patch<Product>(`/products/${product.id}`, body) : await http.post<Product>('/products', body)
      await qc.invalidateQueries({ queryKey: ['products'] })
      await qc.invalidateQueries({ queryKey: ['product', saved.id] })
      await qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(product ? 'Product updated' : 'Product added', `${saved.name} · ${saved.sku}`)
      onSaved?.(saved)
      onClose()
    } catch (e) {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors)) setFieldError(k as keyof In, { message: m })
      setError(e)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" width={560} title={product ? `Edit ${product.name}` : 'Add a product'} description={product ? 'Stock is changed through receipts, orders or adjustments, not here.' : 'Opening stock is recorded as the first movement in its ledger.'}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_1.6fr]">
          <Field id="sku" label="SKU" error={errors.sku?.message}><Input id="sku" invalid={!!errors.sku} {...register('sku')} placeholder="SKU-1042" className="font-mono uppercase" /></Field>
          <Field id="name" label="Name" error={errors.name?.message}><Input id="name" invalid={!!errors.name} {...register('name')} placeholder="Copper Wire 2.5mm, 90m" /></Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="categoryId" label="Category">
            <Select id="categoryId" {...register('categoryId')}>
              <option value="">Uncategorised</option>
              {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="mt-2 flex gap-2">
              <label htmlFor="newcat" className="sr-only">New category name</label>
              <Input id="newcat" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="h-9 text-[13px]" />
              <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addCategory} disabled={newCat.trim().length < 2}>Add</Button>
            </div>
          </Field>
          <Field id="supplierId" label="Default supplier">
            <Select id="supplierId" {...register('supplierId')}>
              <option value="">None</option>
              {sups.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="costPrice" label="Cost price (₹)" error={errors.costPrice?.message}><Input id="costPrice" type="number" step="0.01" inputMode="decimal" invalid={!!errors.costPrice} {...register('costPrice')} className="tnum" /></Field>
          <Field id="sellingPrice" label="Selling price (₹)" error={errors.sellingPrice?.message}><Input id="sellingPrice" type="number" step="0.01" inputMode="decimal" invalid={!!errors.sellingPrice} {...register('sellingPrice')} className="tnum" /></Field>
          <Field id="reorderLevel" label="Reorder at" error={errors.reorderLevel?.message} hint="Units"><Input id="reorderLevel" type="number" inputMode="numeric" invalid={!!errors.reorderLevel} {...register('reorderLevel')} className="tnum" /></Field>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-y border-paper-300 py-3 font-mono text-[12px] text-stone-600">
          <span>Margin per unit {price ? inr(price - cost) : '—'}</span>
          <span>{margin == null ? '—' : `${margin.toFixed(1)}% of price`}</span>
        </div>
        {!product && <Field id="openingStock" label="Opening stock" error={errors.openingStock?.message} hint="Units on hand today"><Input id="openingStock" type="number" inputMode="numeric" invalid={!!errors.openingStock} {...register('openingStock')} className="tnum" /></Field>}
        <Field id="description" label="Description"><Textarea id="description" {...register('description')} placeholder="Optional notes for staff" /></Field>
        <FormError error={error && !(error instanceof ApiError && Object.keys(error.fieldErrors).length) ? error : null} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : product ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
