import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { forwardRef, useEffect, useId, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { InvoiceStatus, OrderStatus, POStatus } from '../../lib/types'
import { ApiError } from '../../lib/api'
import { Button, EASE, Skeleton } from './primitives'

/* ——— Layout ——— */

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-ink-950 px-4 pb-6 pt-10 md:px-7">
      <div className="min-w-0">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="label text-stone-600">{eyebrow}</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-3 text-[clamp(36px,5vw,60px)] font-semibold leading-[0.95] tracking-[-0.05em]">{title}</motion.h1>
        {children && <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A row of figures separated by hairlines — the page's summary, read before the table. */
export function Figures({ items }: { items: { label: string; value: ReactNode; note?: ReactNode; accent?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 border-b border-paper-300 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
      {items.map((f, i) => (
        <motion.div key={f.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05, ease: EASE }}
          className={`relative border-paper-300 px-4 py-5 md:px-7 [&:not(:last-child)]:border-r max-md:[&:nth-child(2n)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b ${f.accent ? 'bg-paper-100' : ''}`}>
          {f.accent && <span className="absolute inset-y-0 left-0 w-[3px] bg-lime" aria-hidden="true" />}
          <dt className="label text-stone-600">{f.label}</dt>
          <dd className="tnum mt-2 font-serif text-[clamp(28px,3vw,38px)] leading-none">{f.value}</dd>
          {f.note && <dd className="mt-2 font-mono text-[11px] text-stone-500">{f.note}</dd>}
        </motion.div>
      ))}
    </dl>
  )
}

/* ——— States ——— */

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-16 md:px-7">
      <div className="grid grid-cols-6 gap-1" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} className={`h-3 w-3 ${i === 7 ? 'bg-lime ring-1 ring-ink-950' : 'ring-1 ring-paper-300'}`} />)}</div>
      <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">{title}</h3>
      {body && <p className="max-w-md text-[14px] text-stone-600">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'Something went wrong while loading this page.'
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <div role="alert" className="px-4 py-16 md:px-7">
      <div className="label text-stone-600">{notFound ? 'Not found' : error instanceof ApiError && error.status === 403 ? 'No access' : 'Could not load'}</div>
      <h2 className="mt-3 font-serif text-[40px] leading-none">{notFound ? 'This record does not exist.' : msg}</h2>
      {notFound && <p className="mt-3 text-stone-600">It may have been deleted, or the link is from another workspace.</p>}
      {onRetry && !notFound && <Button className="mt-6" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/* ——— Status ——— */

const ORDER: Record<OrderStatus, string> = {
  DRAFT: 'border border-dashed border-stone-500', CONFIRMED: 'border border-ink-950 bg-[linear-gradient(90deg,#0B0C0E_50%,transparent_50%)]',
  PROCESSING: 'border border-ink-950 bg-lime', COMPLETED: 'bg-ink-950', CANCELLED: 'border border-paper-300',
}
const PO: Record<POStatus, string> = {
  DRAFT: 'border border-dashed border-stone-500', ORDERED: 'border border-ink-950', PARTIALLY_RECEIVED: 'border border-ink-950 bg-[linear-gradient(90deg,#0B0C0E_50%,transparent_50%)]', RECEIVED: 'bg-ink-950', CANCELLED: 'border border-paper-300',
}
const INV: Record<InvoiceStatus | 'OVERDUE', string> = {
  UNPAID: 'border border-ink-950', PARTIALLY_PAID: 'border border-ink-950 bg-[linear-gradient(90deg,#0B0C0E_50%,transparent_50%)]', PAID: 'bg-ink-950', VOID: 'border border-paper-300', OVERDUE: 'bg-lime ring-1 ring-ink-950',
}
const words = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')

export function Status({ kind, status, overdue }: { kind: 'order' | 'po' | 'invoice'; status: string; overdue?: boolean }) {
  const map = kind === 'order' ? ORDER : kind === 'po' ? PO : INV
  const key = overdue ? 'OVERDUE' : status
  const dead = status === 'CANCELLED' || status === 'VOID'
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${(map as Record<string, string>)[key]}`} aria-hidden="true" />
      <span className={dead ? 'text-stone-500 line-through' : status === 'DRAFT' ? 'text-stone-600' : ''}>{overdue ? `Overdue · ${words(status)}` : words(status)}</span>
    </span>
  )
}

export function StockGauge({ onHand, reorder, state }: { onHand: number; reorder: number; state: 'ok' | 'low' | 'out' }) {
  const scale = Math.max(reorder * 3, onHand, 1)
  return (
    <span className="relative block h-[5px] w-full min-w-16 bg-paper-200" title={`${onHand} on hand, reorder at ${reorder}`}>
      <motion.span className={`absolute inset-y-0 left-0 ${state === 'low' ? 'bg-lime ring-1 ring-inset ring-ink-950' : 'bg-ink-950'}`} initial={{ width: 0 }} animate={{ width: `${Math.max((onHand / scale) * 100, onHand > 0 ? 2 : 0)}%` }} transition={{ duration: 0.7, ease: EASE }} />
      <span className="absolute -top-[3px] h-[11px] w-px bg-stone-500" style={{ left: `${(reorder / scale) * 100}%` }} aria-hidden="true" />
    </span>
  )
}

/* ——— Forms ——— */

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label text-stone-600">{label}</label>
      <div className="mt-2">{children}</div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p key="e" id={`${id}-error`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1.5 text-[12.5px]">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rotate-45 bg-ink-950" aria-hidden="true" />{error}
          </motion.p>
        ) : hint ? <p className="pt-1.5 text-[12px] text-stone-500">{hint}</p> : null}
      </AnimatePresence>
    </div>
  )
}

const control = 'h-11 w-full rounded-[6px] border bg-paper-50 px-3 text-[14.5px] text-ink-950 outline-none transition-[border-color,box-shadow] placeholder:text-stone-500/70 focus:border-ink-950 focus:shadow-[0_0_0_3px_rgb(205_245_69/0.55)] disabled:opacity-50'
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ invalid, className = '', ...p }, ref) => (
  <input ref={ref} {...p} aria-invalid={invalid || undefined} className={`${control} ${invalid ? 'border-ink-950' : 'border-paper-300'} ${className}`} />
))
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ invalid, className = '', children, ...p }, ref) => (
  <select ref={ref} {...p} aria-invalid={invalid || undefined} className={`${control} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230B0C0E' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[position:right_12px_center] bg-no-repeat pr-9 ${invalid ? 'border-ink-950' : 'border-paper-300'} ${className}`}>{children}</select>
))
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ invalid, className = '', ...p }, ref) => (
  <textarea ref={ref} {...p} className={`${control} h-auto min-h-[88px] py-2.5 ${invalid ? 'border-ink-950' : 'border-paper-300'} ${className}`} />
))

export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
  return <motion.div role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="border-l-2 border-ink-950 bg-paper-100 px-4 py-3 text-[13.5px]">{msg}</motion.div>
}

/* ——— Lists ——— */

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** List state lives in the URL, so filters, sort and page survive reloads and can be shared. */
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const [sp, setSp] = useSearchParams()
  const values = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, sp.get(k) ?? d])) as T
  const page = Number(sp.get('page') ?? 1) || 1
  const set = (patch: Partial<T> & { page?: number }) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'page') continue
      if (v === undefined || v === defaults[k]) next.delete(k); else next.set(k, String(v))
    }
    if (patch.page && patch.page > 1) next.set('page', String(patch.page)); else next.delete('page')
    setSp(next, { replace: true })
  }
  return { values, page, set }
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value)
  const debounced = useDebounced(local, 300)
  useEffect(() => { if (debounced !== value) onChange(debounced) }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLocal(value) }, [value])
  const id = useId()
  return (
    <div className="relative w-full max-w-[340px]">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
      <input id={id} value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className={`${control} h-10 border-paper-300 pl-9 pr-9 text-[14px]`} />
      {local && <button onClick={() => { setLocal(''); onChange('') }} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-stone-500 hover:bg-paper-200"><X className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; id: string }) {
  return (
    <div role="tablist" className="flex gap-5 overflow-x-auto text-[13.5px]">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={`relative whitespace-nowrap pb-2 pt-1 transition-colors ${value === o.value ? 'text-ink-950' : 'text-stone-500 hover:text-ink-950'}`}>
          {o.label}{o.count != null && <span className="tnum ml-1.5 text-stone-500">{o.count}</span>}
          {value === o.value && <motion.span layoutId={`tabs-${id}`} className="absolute inset-x-0 bottom-0 h-[2px] bg-ink-950" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </button>
      ))}
    </div>
  )
}

export interface Column<R> { key: string; header: string; cell: (r: R) => ReactNode; align?: 'left' | 'right'; sort?: string; hide?: 'sm' | 'md' | 'lg'; width?: string }

export function DataTable<R extends { id: string }>({ rows, columns, loading, sort, onSort, onRowClick, empty, caption, rowClass }: {
  rows: R[] | undefined; columns: Column<R>[]; loading?: boolean; sort?: { key: string; order: 'asc' | 'desc' }; onSort?: (key: string) => void
  onRowClick?: (r: R) => void; empty?: ReactNode; caption: string; rowClass?: (r: R) => string
}) {
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-950">
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ width: c.width }} className={`label whitespace-nowrap px-3 pb-2.5 pt-1 font-normal text-stone-600 first:pl-4 last:pr-4 md:first:pl-7 md:last:pr-7 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hide ? hide[c.hide] : ''}`}
                aria-sort={sort && c.sort === sort.key ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sort && onSort ? (
                  <button onClick={() => onSort(c.sort!)} className={`inline-flex items-center gap-1 uppercase tracking-[0.09em] hover:text-ink-950 ${sort?.key === c.sort ? 'text-ink-950' : ''}`}>
                    {c.header}{sort?.key === c.sort && (sort.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows ? Array.from({ length: 8 }, (_, i) => (
            <tr key={i} className="border-b border-paper-200">{columns.map((c) => <td key={c.key} className={`px-3 py-3.5 first:pl-4 md:first:pl-7 ${c.hide ? hide[c.hide] : ''}`}><Skeleton className="h-3.5 w-[70%]" /></td>)}</tr>
          )) : rows?.length ? rows.map((r, i) => (
            <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}
              onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest('a,button,input,select')) onRowClick(r) } : undefined}
              className={`group border-b border-paper-200 transition-colors hover:bg-paper-100 ${onRowClick ? 'cursor-pointer' : ''} ${rowClass?.(r) ?? ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-3 text-[13.5px] first:pl-4 last:pr-4 md:first:pl-7 md:last:pr-7 ${c.align === 'right' ? 'tnum text-right' : ''} ${c.hide ? hide[c.hide] : ''}`}>{c.cell(r)}</td>
              ))}
            </motion.tr>
          )) : (
            <tr><td colSpan={columns.length} className="p-0">{empty ?? <EmptyState title="Nothing here yet" />}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 px-4 py-4 text-[13px] text-stone-600 md:px-7">
      <span className="tnum">{from}–{to} of {total.toLocaleString('en-IN')}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-full border border-paper-300 transition-colors hover:border-ink-950 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <span className="tnum px-2">{page} / {pages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-full border border-paper-300 transition-colors hover:border-ink-950 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  )
}

export const toolbar = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-1 pt-5 md:px-7'
