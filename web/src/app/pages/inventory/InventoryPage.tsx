import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, EmptyState, Figures, PageHeader, Pagination, SearchInput, Select, StockGauge, toolbar, useListParams, type Column } from '../../../components/ui/kit'
import { Button } from '../../../components/ui/primitives'
import { useCategories, useList } from '../../../hooks/data'
import { qs } from '../../../lib/api'
import { inr, lakh } from '../../../lib/format'
import type { Page, Product } from '../../../lib/types'
import { Can, useAuth } from '../../auth'
import ProductForm from './ProductForm'

type List = Page<Product> & { summary: { ok: number; low: number; out: number; valueAtCost: number } }

const STOCK = [
  { value: 'all', label: 'All stock' }, { value: 'attention', label: 'Needs attention' }, { value: 'low', label: 'Below reorder' }, { value: 'out', label: 'Out of stock' }, { value: 'ok', label: 'Healthy' },
]
const SORTS = [
  { value: 'name:asc', label: 'Name A–Z' }, { value: 'stockQty:asc', label: 'Lowest stock first' }, { value: 'stockQty:desc', label: 'Highest stock first' },
  { value: 'sellingPrice:desc', label: 'Highest price' }, { value: 'updatedAt:desc', label: 'Recently changed' }, { value: 'sku:asc', label: 'SKU' },
]

export default function InventoryPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { values: f, page, set } = useListParams({ q: '', stock: 'all', category: '', status: 'ACTIVE', sort: 'name:asc' })
  const [sort, order] = f.sort.split(':')
  const list = useList<List>(['products', f, page], `/products${qs({ q: f.q, stock: f.stock, category: f.category, status: f.status, sort, order, page, pageSize: 25 })}`)
  const cats = useCategories()
  const s = list.data?.summary

  const cols: Column<Product>[] = [
    { key: 'name', header: 'Product', sort: 'name', cell: (p) => (
      <Link to={`/app/inventory/${p.id}`} className="block min-w-[200px]">
        <span className="font-medium group-hover:underline">{p.name}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-stone-500">{p.sku}{p.status === 'ARCHIVED' && ' · archived'}</span>
      </Link>
    ) },
    { key: 'cat', header: 'Category', hide: 'md', cell: (p) => <span className="text-stone-600">{p.category?.name ?? '—'}</span> },
    { key: 'sup', header: 'Supplier', hide: 'lg', cell: (p) => <span className="text-stone-600">{p.supplier?.name ?? '—'}</span> },
    { key: 'stock', header: 'On hand · reorder', sort: 'stockQty', width: '210px', cell: (p) => (
      <span className="flex items-center gap-3">
        <span className="tnum w-14 shrink-0 font-mono text-[12.5px]">{p.stockQty}<span className="text-stone-500">/{p.reorderLevel}</span></span>
        <StockGauge onHand={p.stockQty} reorder={p.reorderLevel} state={p.state} />
      </span>
    ) },
    { key: 'cover', header: 'Cover', align: 'right', cell: (p) => <span className={`font-mono text-[12.5px] ${p.state !== 'ok' ? 'font-medium' : 'text-stone-600'}`}>{p.stockQty === 0 ? 'out' : p.coverDays == null ? 'no sales' : `${p.coverDays}d`}</span> },
    { key: 'price', header: 'Price', align: 'right', sort: 'sellingPrice', hide: 'sm', cell: (p) => <span className="font-mono text-[12.5px]">{inr(p.sellingPrice)}</span> },
    ...(can('analytics:read') ? [{ key: 'cost', header: 'Cost', align: 'right' as const, hide: 'lg' as const, cell: (p: Product) => <span className="font-mono text-[12.5px] text-stone-600">{inr(p.costPrice)}</span> }] : []),
  ]

  return (
    <div>
      <PageHeader eyebrow="Inventory" title={<>Stock <span className="font-serif font-normal italic">on hand.</span></>}
        actions={<Can permission="products:write"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add product</Button></Can>}>
        {s && <>{s.ok + s.low + s.out} active products. {s.low + s.out ? `${s.low + s.out} need restocking.` : 'Nothing needs restocking.'}</>}
      </PageHeader>
      <Figures items={[
        { label: 'Active products', value: s ? s.ok + s.low + s.out : '—' },
        { label: 'Below reorder', value: s?.low ?? '—', accent: !!s?.low },
        { label: 'Out of stock', value: s?.out ?? '—', accent: !!s?.out },
        can('analytics:read') ? { label: 'Value at cost', value: s ? lakh(s.valueAtCost) : '—' } : { label: 'Healthy', value: s?.ok ?? '—' },
      ]} />

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside aria-label="Filters" className="border-paper-300 px-4 py-5 md:px-7 lg:border-r lg:px-6">
          <div className="label text-stone-600">Stock</div>
          <ul className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:p-0">
            {STOCK.map((o) => (
              <li key={o.value}>
                <button onClick={() => set({ stock: o.value, page: 1 })} aria-pressed={f.stock === o.value}
                  className={`relative flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${f.stock === o.value ? 'text-ink-950' : 'text-stone-600 hover:bg-paper-100 hover:text-ink-950'}`}>
                  {f.stock === o.value && <motion.span layoutId="stock-facet" className="absolute inset-0 rounded-[6px] bg-paper-200" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="relative">{o.label}</span>
                  <span className="tnum relative font-mono text-[11px] text-stone-500">{s ? { all: s.ok + s.low + s.out, attention: s.low + s.out, low: s.low, out: s.out, ok: s.ok }[o.value] : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:hidden">
            <div><label htmlFor="inv-cat-m" className="label text-stone-600">Category</label>
              <Select id="inv-cat-m" value={f.category} onChange={(e) => set({ category: e.target.value, page: 1 })} className="mt-2 h-9 text-[13px]"><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            <div><label htmlFor="inv-status-m" className="label text-stone-600">Status</label>
              <Select id="inv-status-m" value={f.status} onChange={(e) => set({ status: e.target.value, page: 1 })} className="mt-2 h-9 text-[13px]"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All</option></Select></div>
          </div>
          <div className="label mt-6 hidden text-stone-600 lg:block">Category</div>
          <ul className="mt-3 hidden lg:block lg:space-y-0.5">
            {[{ id: '', name: 'All categories', productCount: undefined as number | undefined }, ...(cats.data ?? [])].map((c) => (
              <li key={c.id || 'all'}>
                <button onClick={() => set({ category: c.id, page: 1 })} aria-pressed={f.category === c.id}
                  className={`relative flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${f.category === c.id ? 'text-ink-950' : 'text-stone-600 hover:bg-paper-100 hover:text-ink-950'}`}>
                  {f.category === c.id && <motion.span layoutId="cat-facet" className="absolute inset-0 rounded-[6px] bg-paper-200" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="relative">{c.name}</span>
                  {c.productCount != null && <span className="tnum relative font-mono text-[11px] text-stone-500">{c.productCount}</span>}
                </button>
              </li>
            ))}
          </ul>
          <label htmlFor="inv-status" className="label mt-6 hidden text-stone-600 lg:block">Status</label>
          <Select id="inv-status" value={f.status} onChange={(e) => set({ status: e.target.value, page: 1 })} className="mt-3 hidden h-9 text-[13px] lg:block">
            <option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All</option>
          </Select>
        </aside>

        <section aria-label="Products" className="min-w-0">
          <div className={toolbar}>
            <SearchInput value={f.q} onChange={(q) => set({ q, page: 1 })} placeholder="Search by name or SKU" />
            <div className="flex items-center gap-2">
              <label htmlFor="inv-sort" className="text-[13px] text-stone-600">Sort</label>
              <Select id="inv-sort" value={f.sort} onChange={(e) => set({ sort: e.target.value, page: 1 })} className="h-9 w-auto text-[13px]">
                {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </div>
          <div className={`mt-3 transition-opacity ${list.isFetching && list.data ? 'opacity-60' : ''}`}>
            <DataTable caption="Products" rows={list.data?.items} columns={cols} loading={list.isLoading}
              sort={{ key: sort, order: order as 'asc' | 'desc' }} onSort={(k) => set({ sort: `${k}:${k === sort && order === 'asc' ? 'desc' : 'asc'}`, page: 1 })}
              onRowClick={(p) => navigate(`/app/inventory/${p.id}`)}
              empty={list.isError ? <EmptyState title="Products couldn’t load" body="Check your connection and try again." action={<Button variant="secondary" onClick={() => list.refetch()}>Retry</Button>} />
                : <EmptyState title={f.q || f.stock !== 'all' || f.category ? 'No products match these filters' : 'No products yet'} body={f.q || f.stock !== 'all' || f.category ? 'Clear a filter to see more.' : 'Add your first product to start tracking stock.'}
                  action={can('products:write') && !f.q ? <Button onClick={() => setCreating(true)}>Add product</Button> : undefined} />} />
          </div>
          {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.pageSize} onPage={(p) => set({ page: p })} />}
        </section>
      </div>
      <ProductForm open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/app/inventory/${p.id}`)} />
    </div>
  )
}
