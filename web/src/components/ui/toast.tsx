import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { EASE } from './primitives'

type Toast = { id: number; kind: 'success' | 'error' | 'info'; title: string; body?: string }
let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(kind: Toast['kind'], title: string, body?: string) {
  const id = ++seq
  toasts = [...toasts.slice(-3), { id, kind, title, body }]
  emit()
  setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4200)
}
toast.success = (title: string, body?: string) => toast('success', title, body)
toast.error = (title: string, body?: string) => toast('error', title, body)
toast.info = (title: string, body?: string) => toast('info', title, body)
const dismiss = (id: number) => { toasts = toasts.filter((t) => t.id !== id); emit() }

export function Toaster() {
  const list = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[70] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }} transition={{ duration: 0.3, ease: EASE }}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="on-ink pointer-events-auto flex items-start gap-3 rounded-[8px] bg-ink-950 py-3 pl-3 pr-2 text-paper-50 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)]">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[3px] ${t.kind === 'success' ? 'bg-lime text-ink-950' : t.kind === 'error' ? 'hatch text-paper-50 ring-1 ring-paper-50' : 'ring-1 ring-ink-600'}`} aria-hidden="true">
              {t.kind === 'success' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-300">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-paper-50"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
