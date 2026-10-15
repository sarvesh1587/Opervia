import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './primitives'

/** Modal with focus containment, Escape to close and focus restored to the opener. */
export function Dialog({ open, onClose, title, description, children, variant = 'center', width = 520 }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; variant?: 'center' | 'sheet'; width?: number
}) {
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const t = setTimeout(() => (panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([data-close])') ?? panel.current)?.focus(), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    const root = document.getElementById('root')
    root?.setAttribute('inert', '') // background is unreachable while the dialog is open
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); document.body.style.overflow = ''; root?.removeAttribute('inert'); opener?.focus?.() }
  }, [open, onClose])

  const sheet = variant === 'sheet'
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-[60] flex ${sheet ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-6'}`}>
          <motion.div className="absolute inset-0 bg-ink-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} tabIndex={-1}
            style={{ maxWidth: sheet ? Math.max(width, 480) : width }}
            className={`relative flex w-full flex-col bg-paper-50 text-ink-950 shadow-[0_40px_80px_-30px_rgb(11_12_14/0.55)] outline-none ${sheet ? 'h-full' : 'max-h-[92vh] rounded-t-[16px] sm:rounded-[14px]'}`}
            initial={sheet ? { x: '100%' } : { opacity: 0, y: 24, scale: 0.98 }} animate={sheet ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }} exit={sheet ? { x: '100%' } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={sheet ? { type: 'spring', stiffness: 380, damping: 40 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-start justify-between gap-4 border-b border-paper-300 px-6 pb-4 pt-5">
              <div>
                <h2 id={`${id}-t`} className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">{title}</h2>
                {description && <div className="mt-1 text-[13.5px] text-stone-600">{description}</div>}
              </div>
              <button data-close onClick={onClose} aria-label="Close" className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-paper-200 hover:text-ink-950"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, pending, danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string; pending?: boolean; danger?: boolean
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width={440}>
      <div className="text-[14.5px] leading-relaxed text-stone-800">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Keep as is</Button>
        <Button variant={danger ? 'primary' : 'primary'} onClick={onConfirm} disabled={pending} data-autofocus>{pending ? 'Working…' : confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
