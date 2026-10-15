import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Menu, Settings, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { EASE, Logo } from '../components/ui/primitives'
import { toast } from '../components/ui/toast'
import { DEMO_MODE, http } from '../lib/api'
import { longDate } from '../lib/format'
import type { Permission } from '../lib/types'
import AssistantPanel, { AssistantMark } from './AssistantPanel'
import { RequireAuth, useAuth } from './auth'

export const NAV: { to: string; label: string; perm: Permission }[] = [
  { to: 'dashboard', label: 'Overview', perm: 'products:read' },
  { to: 'inventory', label: 'Inventory', perm: 'products:read' },
  { to: 'purchase-orders', label: 'Purchasing', perm: 'purchaseOrders:read' },
  { to: 'orders', label: 'Sales', perm: 'salesOrders:read' },
  { to: 'invoices', label: 'Invoices', perm: 'invoices:read' },
  { to: 'customers', label: 'Customers', perm: 'customers:read' },
  { to: 'suppliers', label: 'Suppliers', perm: 'suppliers:read' },
  { to: 'analytics', label: 'Analytics', perm: 'analytics:read' },
]

const AssistantCtx = createContext<{ open: (q?: string) => void }>({ open: () => {} })
export const useAssistant = () => useContext(AssistantCtx)

function AccountMenu() {
  const { user, business } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const initials = user.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const logout = async () => {
    try { if (!DEMO_MODE) await http.post('/auth/logout') } catch { /* the session is cleared locally either way */ }
    qc.clear()
    navigate('/login', { replace: true })
    toast.success('Signed out')
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account menu for ${user.name}`}
        className="grid h-8 w-8 place-items-center rounded-full bg-paper-50 text-[11px] font-semibold text-ink-950 ring-offset-2 ring-offset-ink-950 transition-shadow hover:ring-2 hover:ring-paper-50/30">{initials}</button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18, ease: EASE }}
            style={{ transformOrigin: 'top right' }} className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-[10px] border border-paper-300 bg-paper-50 text-ink-950 shadow-[0_24px_48px_-20px_rgb(11_12_14/0.45)]">
            <div className="border-b border-paper-200 px-4 py-3">
              <div className="text-[13.5px] font-medium">{user.name}</div>
              <div className="truncate text-[12.5px] text-stone-600">{user.email}</div>
              <div className="label mt-1.5 text-stone-500">{user.role} · {business.name}</div>
            </div>
            <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] hover:bg-paper-100"><Settings className="h-4 w-4 text-stone-600" />Settings</Link>
            <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] hover:bg-paper-100"><LogOut className="h-4 w-4 text-stone-600" />Log out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Shell() {
  const outlet = useOutlet()
  const location = useLocation()
  const { business, can } = useAuth()
  const nav = NAV.filter((n) => can(n.perm))
  const [assistant, setAssistant] = useState<{ open: boolean; q: string | null; key: number }>({ open: false, q: null, key: 0 })
  const [mobileNav, setMobileNav] = useState(false)
  const open = useCallback((q?: string) => setAssistant((a) => ({ open: true, q: q ?? null, key: q ? a.key + 1 : a.key })), [])
  const close = () => setAssistant((a) => ({ ...a, open: false }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAssistant((a) => ({ ...a, open: !a.open, q: null })) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setMobileNav(false); setAssistant((a) => (a.open && location.pathname.endsWith('/assistant') ? { ...a, open: false } : a)) }, [location.pathname])
  useEffect(() => {
    if (!assistant.open && !mobileNav) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); setMobileNav(false) } }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [assistant.open, mobileNav])

  const section = location.pathname.split('/')[2] ?? ''
  return (
    <AssistantCtx.Provider value={{ open }}>
      <div className="min-h-screen bg-paper-50">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-lime focus:px-3 focus:py-2">Skip to content</a>
        <header className="on-ink sticky top-0 z-40 bg-ink-950 text-paper-50">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:px-7">
            <Link to="/app/dashboard" aria-label="Opervia overview"><Logo tone="paper" /></Link>
            <nav aria-label="Primary" className="hidden h-full flex-1 items-stretch gap-1 lg:flex">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} className={() => `relative flex items-center px-2.5 text-[13.5px] transition-colors duration-150 ${section === n.to ? 'text-paper-50' : 'text-ink-300 hover:text-paper-50'}`}>
                  {n.label}
                  {section === n.to && <motion.span layoutId="nav-indicator" className="absolute inset-x-2.5 bottom-0 h-[2px] bg-lime" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <button onClick={() => open()} className="group hidden h-8 items-center gap-2 rounded-full border border-ink-700 bg-ink-900 pl-2.5 pr-1.5 text-[13px] text-ink-300 transition-colors hover:border-ink-600 hover:text-paper-50 sm:inline-flex">
                <AssistantMark className="h-3.5 w-3.5 text-paper-50" />Ask Opervia
                <kbd className="rounded-[4px] border border-ink-700 px-1.5 py-px font-mono text-[10.5px] text-ink-400">⌘J</kbd>
              </button>
              <AccountMenu />
              <button onClick={() => setMobileNav(true)} aria-label="Open navigation" className="grid h-8 w-8 place-items-center rounded-full text-paper-50 hover:bg-ink-850 lg:hidden"><Menu className="h-[18px] w-[18px]" /></button>
            </div>
          </div>
        </header>
        <div className="border-b border-paper-300 bg-paper-50">
          <div className="label mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-stone-500 md:px-7">
            <span className="text-ink-950">{business.name}</span>
            {business.city && <span>{business.city}</span>}
            <span>{longDate()}</span>
            {business.isDemo && <span className="ml-auto inline-flex items-center gap-2 text-ink-950"><span className="h-1.5 w-1.5 bg-lime ring-1 ring-ink-950" />{DEMO_MODE ? 'Static preview · bundled sample data' : 'Demo workspace · seeded records, demo payments'}</span>}
          </div>
        </div>

        <main id="main" className="mx-auto max-w-[1440px] pb-24">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.24, ease: EASE }}>
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>

        <button onClick={() => open()} className="fixed bottom-5 right-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-ink-950 pl-4 pr-5 text-[14px] text-paper-50 shadow-[0_18px_40px_-16px_rgb(11_12_14/0.6)] transition-transform active:scale-95 sm:hidden">
          <AssistantMark className="h-4 w-4" />Ask
        </button>

        <AnimatePresence>
          {assistant.open && (
            <>
              <motion.div key="scrim" className="fixed inset-0 z-50 bg-ink-950/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={close} />
              <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Ask Opervia"
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] shadow-[-30px_0_60px_-30px_rgb(0_0_0/0.5)]"
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 0.9 }}>
                <AssistantPanel key={assistant.key} initialQuestion={assistant.q} onClose={close} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mobileNav && (
            <motion.div role="dialog" aria-modal="true" aria-label="Navigation" className="on-ink fixed inset-0 z-50 flex flex-col bg-ink-950 text-paper-50 lg:hidden" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} exit={{ clipPath: 'inset(0 0 100% 0)' }} transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}>
              <div className="flex h-14 items-center justify-between px-4">
                <Logo tone="paper" />
                <button onClick={() => setMobileNav(false)} aria-label="Close navigation" className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink-850"><X className="h-5 w-5" /></button>
              </div>
              <motion.nav className="flex-1 overflow-y-auto px-4 pt-4" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.04, delayChildren: 0.18 } } }}>
                {[...nav, { to: 'assistant', label: 'Assistant', perm: 'assistant:use' as Permission }, { to: 'settings', label: 'Settings', perm: 'assistant:use' as Permission }].map((n, i) => (
                  <motion.div key={n.to} variants={{ h: { opacity: 0, y: 14 }, v: { opacity: 1, y: 0, transition: { ease: EASE, duration: 0.45 } } }}>
                    <NavLink to={n.to} className={() => `flex items-baseline gap-4 border-b border-ink-800 py-3 text-[28px] font-medium tracking-[-0.03em] ${section === n.to ? 'text-lime' : 'text-paper-50'}`}>
                      <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>{n.label}
                    </NavLink>
                  </motion.div>
                ))}
              </motion.nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AssistantCtx.Provider>
  )
}

export default function AppShell() {
  return <RequireAuth><Shell /></RequireAuth>
}
