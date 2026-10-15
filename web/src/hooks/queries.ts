import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Range } from '../lib/types'

export const useOverview = (range: Range) =>
  useQuery({ queryKey: ['overview', range], queryFn: () => api.overview(range), placeholderData: keepPreviousData, staleTime: 60_000 })

export const useAsk = () => useMutation({ mutationFn: (q: string) => api.ask(q) })
