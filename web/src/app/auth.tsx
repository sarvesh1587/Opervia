import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/ui/primitives'
import { toast } from '../components/ui/toast'
import { ApiError, DEMO_MODE, http } from '../lib/api'
import type { Permission, Session } from '../lib/types'

const DEMO_SESSION: Session = {
  user: { id: 'demo', name: 'Meera Rao', email: 'admin@opervia.demo', role: 'ADMIN' },
  business: { id: 'demo', name: 'Rao Electricals Pvt Ltd', city: 'Pune', currency: 'INR', taxRate: 18, taxLabel: 'GST', paymentTermsDays: 15, isDemo: true },
  permissions: ['products:read', 'salesOrders:read', 'analytics:read', 'assistant:use'],
  ai: { configured: false },
}

interface AuthValue extends Session { can: (p: Permission) => boolean }
const Ctx = createContext<AuthValue | null>(null)

export const useSession = () => useQuery({ queryKey: ['session'], queryFn: () => (DEMO_MODE ? Promise.resolve(DEMO_SESSION) : http.get<Session>('/auth/me')), retry: false, staleTime: 5 * 60_000 })

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside RequireAuth')
  return v
}

export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  return useAuth().can(permission) ? <>{children}</> : <>{fallback}</>
}

/** Gate for /app: loads the session, redirects to sign-in when there is none, and reacts to expiry mid-session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const q = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    const onExpired = (e: Event) => {
      qc.clear()
      toast.info('Signed out', (e as CustomEvent).detail ?? 'Your session ended. Sign in again to continue.')
      navigate(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true })
    }
    window.addEventListener('opervia:unauthorized', onExpired)
    return () => window.removeEventListener('opervia:unauthorized', onExpired)
  }, [qc, navigate, loc])

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper-50" aria-busy="true">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center gap-4">
          <Logo />
          <span className="label text-stone-500">Opening your workspace</span>
        </motion.div>
      </div>
    )
  }
  if (q.error instanceof ApiError && q.error.status === 401) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="grid min-h-screen place-items-center bg-paper-50 px-6 text-center">
        <div>
          <Logo />
          <h1 className="mt-8 font-serif text-[40px] leading-none">The server isn’t answering.</h1>
          <p className="mx-auto mt-3 max-w-md text-stone-600">{q.error instanceof ApiError ? q.error.message : 'Check that the Opervia API is running, then try again.'}</p>
          <button onClick={() => q.refetch()} className="mt-6 h-10 rounded-full bg-ink-950 px-5 text-[14px] text-paper-50">Try again</button>
        </div>
      </div>
    )
  }
  const s = q.data
  return <Ctx.Provider value={{ ...s, can: (p) => DEMO_MODE || s.permissions.includes(p) }}>{children}</Ctx.Provider>
}

/** Route-level guard for pages a role may not open, e.g. analytics for staff. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, user } = useAuth()
  if (can(permission)) return <>{children}</>
  return (
    <section className="px-4 py-24 md:px-7" role="alert">
      <div className="label text-stone-600">No access</div>
      <h1 className="mt-4 text-[clamp(40px,6vw,72px)] font-semibold leading-[0.92] tracking-[-0.05em]">This area is for <span className="font-serif font-normal italic">managers.</span></h1>
      <p className="mt-4 max-w-lg text-stone-600">Your role ({user.role.toLowerCase()}) doesn’t include it. Ask an admin if you need access.</p>
    </section>
  )
}
