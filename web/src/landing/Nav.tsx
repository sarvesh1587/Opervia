import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEMO_HREF } from './demoHref'
import { Link } from 'react-router-dom'
import { Arrow, ButtonLink, EASE, Logo } from '../components/ui/primitives'

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#inventory', label: 'Inventory' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#assistant', label: 'Assistant' },
]

export default function Nav() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0
    setScrolled(y > 24)
    setHidden(y > 640 && y > prev && !open)
  })
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : '' }, [open])

  return (
    <>
      <motion.header animate={{ y: hidden ? -80 : 0 }} transition={{ duration: 0.35, ease: EASE }}
        className={`on-ink fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${scrolled ? 'border-b border-ink-800 bg-ink-950/92 backdrop-blur-md' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-5 md:px-10">
          <Link to="/" aria-label="Opervia home"><Logo tone="paper" /></Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="group relative py-1 text-[14px] text-ink-300 transition-colors hover:text-paper-50">
                {l.label}
                <span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-lime transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:scale-x-100" />
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link to="/login" className="hidden px-3 text-[14px] text-ink-300 transition-colors hover:text-paper-50 sm:inline">Log in</Link>
            <ButtonLink to={DEMO_HREF} variant="lime" size="sm" className="hidden sm:inline-flex">Open the demo <Arrow /></ButtonLink>
            <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="grid h-10 w-10 place-items-center rounded-full text-paper-50 hover:bg-ink-850 md:hidden"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-modal="true" aria-label="Menu" className="on-ink fixed inset-0 z-[60] flex flex-col bg-ink-950 px-5 text-paper-50"
            initial={{ clipPath: 'circle(0% at calc(100% - 40px) 32px)' }} animate={{ clipPath: 'circle(150% at calc(100% - 40px) 32px)' }} exit={{ clipPath: 'circle(0% at calc(100% - 40px) 32px)' }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
            <div className="flex h-16 items-center justify-between">
              <Logo tone="paper" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-850"><X className="h-5 w-5" /></button>
            </div>
            <motion.nav className="mt-10 flex-1" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.05, delayChildren: 0.25 } } }}>
              {LINKS.map((l, i) => (
                <motion.a key={l.href} href={l.href} onClick={() => setOpen(false)} variants={{ h: { opacity: 0, y: 24 }, v: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
                  className="flex items-baseline gap-4 border-b border-ink-800 py-4 text-[38px] font-medium tracking-[-0.04em]">
                  <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>{l.label}
                </motion.a>
              ))}
            </motion.nav>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="grid grid-cols-2 gap-3 pb-8">
              <ButtonLink to="/login" variant="inverse" size="lg">Log in</ButtonLink>
              <ButtonLink to={DEMO_HREF} variant="lime" size="lg">Open demo</ButtonLink>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
