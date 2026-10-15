import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Arrow, Button, EASE, Logo } from '../components/ui/primitives'
import { ApiError, DEMO_MODE, http } from '../lib/api'
import type { Role } from '../lib/types'

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  business: z.string().trim().min(2, 'Enter your business name'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a number'),
})
type Values = z.infer<typeof registerSchema>

function Field({ id, label, error, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label text-stone-600">{label}</label>
      <input id={id} {...p} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        className={`mt-2 h-12 w-full border-b bg-transparent text-[17px] outline-none transition-colors placeholder:text-stone-500/60 focus:border-ink-950 ${error ? 'border-ink-950' : 'border-paper-300'}`} />
      <AnimatePresence>
        {error && <motion.p id={`${id}-err`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1.5 text-[12.5px]">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rotate-45 bg-ink-950" />{error}</motion.p>}
      </AnimatePresence>
    </div>
  )
}

const ROLES: { role: Role; title: string; body: string }[] = [
  { role: 'ADMIN', title: 'Admin', body: 'Everything, including people, settings and the audit log.' },
  { role: 'MANAGER', title: 'Manager', body: 'Operations, purchasing, invoices and analytics.' },
  { role: 'STAFF', title: 'Staff', body: 'Orders, customers and receiving. No financial analytics.' },
]

function DemoAccess() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pending, setPending] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enter = async (role: Role) => {
    setPending(role); setError(null)
    try {
      if (!DEMO_MODE) await http.post('/auth/demo', { role })
      await qc.invalidateQueries({ queryKey: ['session'] })
      navigate('/app/dashboard')
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 404 ? 'Demo access is turned off on this server.' : e.message) : 'Could not open the demo workspace.')
    } finally { setPending(null) }
  }
  return (
    <div className="mt-10 border-t border-paper-300 pt-6">
      <p className="text-[14px] text-stone-600">Or explore the seeded demo workspace as:</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {ROLES.map((r) => (
          <button key={r.role} onClick={() => enter(r.role)} disabled={!!pending}
            className="group rounded-[8px] border border-paper-300 p-3 text-left transition-[border-color,background-color] hover:border-ink-950 hover:bg-paper-100 disabled:opacity-60">
            <span className="flex items-center justify-between text-[14px] font-medium">{r.title}<span className="text-stone-500 transition-transform group-hover:translate-x-0.5">{pending === r.role ? '…' : '→'}</span></span>
            <span className="mt-1 block text-[12px] leading-snug text-stone-600">{r.body}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-[13px]">{error}</p>}
    </div>
  )
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isReg = mode === 'register'
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const qc = useQueryClient()
  const [serverMsg, setServerMsg] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver((isReg ? registerSchema : loginSchema) as typeof registerSchema),
    mode: 'onTouched',
  })
  const next = sp.get('next')?.startsWith('/app') ? sp.get('next')! : '/app/dashboard'

  const onSubmit = async (v: Values) => {
    setServerMsg(null)
    if (DEMO_MODE) { setServerMsg('This static preview has no server. Use the demo workspace below.'); return }
    try {
      await http.post(`/auth/${mode}`, isReg ? v : { email: v.email, password: v.password })
      await qc.invalidateQueries({ queryKey: ['session'] })
      navigate(next, { replace: true })
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [k, m] of Object.entries(e.fieldErrors)) setError(k as keyof Values, { message: m })
        setServerMsg(Object.keys(e.fieldErrors).length ? null : e.message)
      } else setServerMsg('Sign-in failed. Try again.')
    }
  }

  return (
    <div className="grid min-h-screen bg-paper-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="on-ink hairline-grid relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-10 text-paper-50 lg:flex">
        <Link to="/" aria-label="Opervia home"><Logo tone="paper" /></Link>
        <div>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }} className="max-w-lg font-serif text-[46px] leading-[1.02]">
            “Which invoices are overdue?” <span className="text-ink-400">should be a question, not a report you build on Friday night.</span>
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-10 grid max-w-lg grid-cols-3 border-t border-ink-700 font-mono text-[11px] text-ink-400">
            {['Inventory', 'Orders', 'Invoices'].map((t) => <div key={t} className="border-r border-ink-800 py-3 last:border-r-0 [&:not(:first-child)]:pl-3">{t}</div>)}
          </motion.div>
        </div>
        <div className="label text-ink-400">Intelligent Operations. Clear Decisions.</div>
      </aside>

      <main className="flex flex-col px-5 py-6 md:px-14">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:invisible" aria-label="Opervia home"><Logo /></Link>
          <Link to={isReg ? '/login' : '/register'} className="text-[14px] link-underline">{isReg ? 'I already have an account' : 'Create a workspace'}</Link>
        </div>
        <motion.div key={mode} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="m-auto w-full max-w-[460px] py-14">
          <h1 className="text-[48px] font-semibold leading-[0.95] tracking-[-0.05em]">{isReg ? <>Open your <span className="font-serif font-normal italic">books.</span></> : <>Welcome <span className="font-serif font-normal italic">back.</span></>}</h1>
          {isReg && <p className="mt-3 text-[14.5px] text-stone-600">You become the admin of a new, empty workspace.</p>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-6">
            {isReg && <Field id="name" label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />}
            {isReg && <Field id="business" label="Business name" autoComplete="organization" error={errors.business?.message} {...register('business')} />}
            <Field id="email" label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Field id="password" label="Password" type="password" autoComplete={isReg ? 'new-password' : 'current-password'} error={errors.password?.message} {...register('password')} />
            <AnimatePresence>
              {serverMsg && <motion.div role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-l-2 border-ink-950 bg-paper-100 px-4 py-3 text-[13.5px]">{serverMsg}</motion.div>}
            </AnimatePresence>
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Checking…' : isReg ? 'Create workspace' : 'Log in'} {!isSubmitting && <Arrow />}</Button>
          </form>
          {!isReg && <DemoAccess />}
        </motion.div>
      </main>
    </div>
  )
}
