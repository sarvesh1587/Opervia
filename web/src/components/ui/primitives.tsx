import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from 'framer-motion'
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export const EASE = [0.22, 1, 0.36, 1] as const

/** Opervia mark: an open ledger square overlapped by a filled one. Slides into register on hover. */
export function Logo({ tone = 'ink', className = '' }: { tone?: 'ink' | 'paper'; className?: string }) {
  const stroke = tone === 'ink' ? '#0B0C0E' : '#F7F5F0'
  return (
    <motion.span className={`inline-flex items-center gap-2.5 ${className}`} initial="rest" whileHover="hover" animate="rest">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="overflow-visible">
        <motion.rect x="1" y="1" width="13" height="13" fill="none" stroke={stroke} strokeWidth="1.6"
          variants={{ rest: { x: 0, y: 0 }, hover: { x: 3.5, y: 3.5 } }} transition={{ duration: 0.35, ease: EASE }} />
        <motion.rect x="8" y="8" width="13" height="13" fill="#CDF545" stroke={stroke} strokeWidth="1.6"
          variants={{ rest: { x: 0, y: 0 }, hover: { x: -3.5, y: -3.5 } }} transition={{ duration: 0.35, ease: EASE }} />
      </svg>
      <span className={`text-[21px] font-semibold tracking-[-0.045em] ${tone === 'ink' ? 'text-ink-950' : 'text-paper-50'}`}>opervia</span>
    </motion.span>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'lime' | 'inverse'
type Size = 'sm' | 'md' | 'lg'
const btnBase = 'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[var(--ease-out-quint)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45'
const btnVariant: Record<Variant, string> = {
  primary: 'bg-ink-950 text-paper-50 hover:bg-ink-800',
  secondary: 'border border-ink-950/80 text-ink-950 hover:bg-ink-950 hover:text-paper-50',
  ghost: 'text-ink-950 hover:bg-ink-950/[0.06]',
  lime: 'bg-lime text-ink-950 hover:bg-[#d9fb63] shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]',
  inverse: 'border border-paper-50/25 text-paper-50 hover:border-paper-50/70 hover:bg-paper-50/[0.06]',
}
const btnSize: Record<Size, string> = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-sm', lg: 'h-[52px] px-7 text-[15px]' }
export const btn = (v: Variant = 'primary', s: Size = 'md', extra = '') => `${btnBase} ${btnVariant[v]} ${btnSize[s]} ${extra}`

export const Arrow = () => (
  <span aria-hidden="true" className="relative inline-block h-4 w-4 overflow-hidden">
    <ArrowRight className="absolute inset-0 h-4 w-4 transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:translate-x-full" strokeWidth={1.8} />
    <ArrowRight className="absolute inset-0 h-4 w-4 -translate-x-full transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:translate-x-0" strokeWidth={1.8} />
  </span>
)

export const ButtonLink = ({ variant, size, className, children, ...p }: LinkProps & { variant?: Variant; size?: Size }) => (
  <Link {...p} className={btn(variant, size, className as string)}>{children}</Link>
)

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ variant, size, className = '', ...p }, ref) => <button ref={ref} {...p} className={btn(variant, size, className)} />,
)

/** Fades and lifts content into view once. */
export function Reveal({ children, delay = 0, y = 22, className = '', as = 'div', ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' } & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const reduce = useReducedMotion()
  const M = motion[as] as typeof motion.div
  return (
    <M className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ duration: 0.7, delay, ease: EASE }} {...rest}>
      {children}
    </M>
  )
}

/** Animates between numeric values; formats every frame. */
export function CountUp({ value, format, duration = 1.1, className = '' }: { value: number; format: (n: number) => string; duration?: number; className?: string }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(reduce ? value : value * 0.82)
  const text = useTransform(mv, (v) => format(v))
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (!inView) return
    if (reduce) { mv.set(value); return }
    const c = animate(mv, value, { duration: started ? 0.7 : duration, ease: EASE })
    setStarted(true)
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduce])
  return <motion.span ref={ref} className={`tnum ${className}`}>{text}</motion.span>
}

export function Sparkline({ data, width = 72, height = 26, stroke = 'currentColor', dot = true }: { data: number[]; width?: number; height?: number; stroke?: string; dot?: boolean }) {
  const min = Math.min(...data), max = Math.max(...data)
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const x = (i: number) => 2 + (i * (width - 6)) / (data.length - 1)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0 overflow-visible">
      <motion.path d={d} fill="none" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} />
      {dot && <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.4" fill={stroke} />}
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-[3px] bg-current opacity-[0.08] ${className}`} />
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
