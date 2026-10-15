import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http, qs } from '../lib/api'
import { inr } from '../lib/format'
import type { Page, Product } from '../lib/types'
import { useDebounced } from './ui/kit'
import { EASE } from './ui/primitives'

export interface Line { productId: string; name: string; sku: string; quantity: number; unitPrice: number; unitCost: number; stock: number }

/** Accessible product combobox backed by server-side search. */
function ProductSearch({ onPick, exclude, supplierId }: { onPick: (p: Product) => void; exclude: string[]; supplierId?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const dq = useDebounced(q, 200)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const res = useQuery({ queryKey: ['product-search', dq, supplierId], queryFn: () => http.get<Page<Product>>(`/products${qs({ q: dq, pageSize: 8, sort: 'name', supplierId })}`), enabled: open, staleTime: 30_000 })
  const items = (res.data?.items ?? []).filter((p) => !exclude.includes(p.id))
  useEffect(() => setActive(0), [dq])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const pick = (p: Product) => { onPick(p); setQ(''); setOpen(false) }
  return (
    <div ref={box} className="relative">
      <label htmlFor={id} className="sr-only">Add a product</label>
      <div className="flex items-center gap-2 rounded-[6px] border border-dashed border-stone-500 px-3 focus-within:border-solid focus-within:border-ink-950 focus-within:shadow-[0_0_0_3px_rgb(205_245_69/0.55)]">
        <Plus className="h-4 w-4 text-stone-600" aria-hidden="true" />
        <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && items[active] ? `${id}-${items[active].id}` : undefined} autoComplete="off"
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]) }
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Add a product — search by name or SKU" className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-stone-500" />
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul id={`${id}-list`} role="listbox" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: EASE }}
            className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-[8px] border border-paper-300 bg-paper-50 py-1 shadow-[0_20px_40px_-20px_rgb(11_12_14/0.4)]">
            {res.isLoading && <li className="px-3 py-2.5 text-[13px] text-stone-500">Searching…</li>}
            {!res.isLoading && items.length === 0 && <li className="px-3 py-2.5 text-[13px] text-stone-500">No matching active products.</li>}
            {items.map((p, i) => (
              <li key={p.id} id={`${id}-${p.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(p) }}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13.5px] ${i === active ? 'bg-paper-200' : ''}`}>
                <span className="min-w-0"><span className="block truncate">{p.name}</span><span className="font-mono text-[11px] text-stone-500">{p.sku}</span></span>
                <span className={`tnum shrink-0 font-mono text-[12px] ${p.stockQty === 0 ? 'text-stone-500 line-through' : ''}`}>{p.stockQty} in stock</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function LineEditor({ mode, lines, onChange, error, supplierId }: { mode: 'sale' | 'purchase'; lines: Line[]; onChange: (l: Line[]) => void; error?: string; supplierId?: string }) {
  const update = (i: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div>
      <div className="label flex border-b border-ink-950 pb-2 text-stone-600">
        <span className="flex-1">Product</span><span className="w-20 text-right">Qty</span><span className="w-28 text-right">{mode === 'sale' ? 'Unit price' : 'Unit cost'}</span><span className="w-28 text-right">Amount</span><span className="w-9" />
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {lines.map((l, i) => {
            const short = mode === 'sale' && l.quantity > l.stock
            return (
              <motion.li key={l.productId} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden border-b border-paper-200">
                <div className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{l.name}</span>
                    <span className={`font-mono text-[11px] ${short ? 'text-ink-950' : 'text-stone-500'}`}>{l.sku} · {l.stock} in stock{short && ' · short — confirming will fail'}</span>
                  </span>
                  <label className="sr-only" htmlFor={`q-${l.productId}`}>Quantity of {l.name}</label>
                  <input id={`q-${l.productId}`} type="number" min={1} inputMode="numeric" value={l.quantity} onChange={(e) => update(i, { quantity: Math.max(0, Math.floor(Number(e.target.value))) })}
                    className={`tnum h-9 w-20 rounded-[6px] border bg-paper-50 px-2 text-right font-mono text-[13px] outline-none focus:border-ink-950 ${short || l.quantity < 1 ? 'border-ink-950' : 'border-paper-300'}`} />
                  {mode === 'purchase' ? (
                    <>
                      <label className="sr-only" htmlFor={`c-${l.productId}`}>Unit cost of {l.name}</label>
                      <input id={`c-${l.productId}`} type="number" min={0} step="0.01" inputMode="decimal" value={l.unitCost} onChange={(e) => update(i, { unitCost: Number(e.target.value) })}
                        className="tnum h-9 w-28 rounded-[6px] border border-paper-300 bg-paper-50 px-2 text-right font-mono text-[13px] outline-none focus:border-ink-950" />
                    </>
                  ) : <span className="tnum w-28 text-right font-mono text-[13px] text-stone-600">{inr(l.unitPrice)}</span>}
                  <span className="tnum w-28 text-right font-mono text-[13px]">{inr(l.quantity * (mode === 'sale' ? l.unitPrice : l.unitCost))}</span>
                  <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={`Remove ${l.name}`} className="grid h-9 w-9 place-items-center rounded-full text-stone-500 hover:bg-paper-200 hover:text-ink-950"><X className="h-4 w-4" /></button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="mt-3">
        <ProductSearch supplierId={supplierId} exclude={lines.map((l) => l.productId)} onPick={(p) => onChange([...lines, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, unitPrice: p.sellingPrice, unitCost: p.costPrice, stock: p.stockQty }])} />
      </div>
      {error && <p role="alert" className="pt-2 text-[12.5px]"><span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rotate-45 bg-ink-950" />{error}</p>}
    </div>
  )
}
