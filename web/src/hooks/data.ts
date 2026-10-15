import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from '../components/ui/toast'
import { ApiError, http } from '../lib/api'
import type { Category, Page, SupplierRow } from '../lib/types'

/** List/detail queries keep showing the previous page while the next one loads. */
export const useList = <T,>(key: QueryKey, path: string) => useQuery({ queryKey: key, queryFn: ({ signal }) => http.get<T>(path, signal), placeholderData: keepPreviousData })
export const useDetail = <T,>(key: QueryKey, path: string, enabled = true) => useQuery({ queryKey: key, queryFn: ({ signal }) => http.get<T>(path, signal), enabled })

/** Mutation with integrated success/error toasts and cache invalidation. Field errors are left to forms. */
export function useAction<V, R>(fn: (v: V) => Promise<R>, opts: { success?: string | ((r: R) => string); invalidate?: QueryKey[]; onSuccess?: (r: R) => void; silentFieldErrors?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })))
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success)
      opts.onSuccess?.(r)
    },
    onError: (e) => {
      if (opts.silentFieldErrors && e instanceof ApiError && Object.keys(e.fieldErrors).length) return
      toast.error(e instanceof ApiError ? e.message : 'Something went wrong.', e instanceof ApiError && e.status === 409 ? 'Nothing was changed.' : undefined)
    },
  })
}

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => http.get<Category[]>('/products/categories'), staleTime: 60_000 })
export const useSupplierOptions = () => useQuery({ queryKey: ['suppliers', 'options'], queryFn: () => http.get<Page<SupplierRow>>('/suppliers?pageSize=100&status=ACTIVE'), staleTime: 60_000, select: (p) => p.items })

export const idemKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
