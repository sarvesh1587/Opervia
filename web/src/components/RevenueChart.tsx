import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { inr, lakh, shortDate } from '../lib/format'
import { EASE, useElementWidth } from './ui/primitives'

const K = 72 // resample size so paths morph cleanly between ranges

function resample(a: number[], k = K) {
  if (a.length === 0) return Array(k).fill(0)
  return Array.from({ length: k }, (_, i) => {
    const t = (i / (k - 1)) * (a.length - 1)
    const lo = Math.floor(t), hi = Math.min(a.length - 1, lo + 1)
    return a[lo] + (a[hi] - a[lo]) * (t - lo)
  })
}
const cumulative = (a: number[]) => { let s = 0; return a.map((v) => (s += v)) }
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s >= m) ?? 10) * p }

const THEMES = {
  paper: { line: '#0B0C0E', prev: '#9A958B', area: 'rgba(205,245,69,.32)', bar: '#D3CCBE', peak: '#0B0C0E', grid: '#E3DDD1', text: '#77736A', tipBg: '#0B0C0E', tipFg: '#F7F5F0', dot: '#CDF545' },
  ink: { line: '#CDF545', prev: '#646871', area: 'rgba(205,245,69,.10)', bar: '#2B2F36', peak: '#CDF545', grid: '#22252B', text: '#8A8E96', tipBg: '#F7F5F0', tipFg: '#0B0C0E', dot: '#CDF545' },
}

export interface RevenueChartProps {
  dates: string[]
  current: number[]
  previous: number[]
  tone?: 'paper' | 'ink'
  height?: number
  peakLabel?: string
  rangeKey: string
}

export default function RevenueChart({ dates, current, previous, tone = 'paper', height = 300, peakLabel, rangeKey }: RevenueChartProps) {
  const [ref, W] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const c = THEMES[tone]
  const N = current.length
  const padR = 48, axisH = 24, barBand = 46
  const plotW = Math.max(0, W - padR)
  const lineBottom = height - axisH - barBand - 8

  const g = useMemo(() => {
    const cc = cumulative(current), pc = cumulative(previous)
    const max = niceCeil(Math.max(cc[N - 1] ?? 1, pc[pc.length - 1] ?? 1) * 1.04)
    const yv = (v: number) => 14 + (1 - v / max) * (lineBottom - 14)
    const xi = (i: number) => (N <= 1 ? 0 : (i / (N - 1)) * plotW)
    const rs = (a: number[]) => resample(a).map((v, i) => [(i / (K - 1)) * plotW, yv(v)] as [number, number])
    const curPts = rs(cc), prevPts = rs(pc)
    const curD = smooth(curPts)
    const area = `${curD} L${plotW.toFixed(1)} ${lineBottom} L0 ${lineBottom} Z`
    const maxDaily = Math.max(...current, 1)
    const peak = current.indexOf(Math.max(...current))
    const ticks = [0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: yv(max * f) }))
    return { cc, pc, max, yv, xi, curD, prevD: smooth(prevPts), area, maxDaily, peak, ticks }
  }, [current, previous, N, plotW, lineBottom])

  const barW = Math.max(1.5, Math.min(14, (plotW / Math.max(N, 1)) * 0.56))
  const barTop = height - axisH - barBand
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (N - 1))
    setHover(Math.max(0, Math.min(N - 1, i)))
  }
  const hx = hover != null ? g.xi(hover) : 0
  const pathT = reduce ? { duration: 0 } : { duration: 0.8, ease: EASE }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={height} role="img" aria-label={`Cumulative revenue ${inr(g.cc[N - 1] ?? 0)} against ${inr(g.pc[g.pc.length - 1] ?? 0)} in the previous period`} className="block overflow-visible">
          {g.ticks.map((t) => (
            <g key={t.v}>
              <line x1={0} x2={plotW} y1={t.y} y2={t.y} stroke={c.grid} />
              <text x={W - 4} y={t.y + 3.5} textAnchor="end" className="font-mono" fontSize="10" fill={c.text}>{lakh(t.v)}</text>
            </g>
          ))}
          <line x1={0} x2={plotW} y1={lineBottom} y2={lineBottom} stroke={tone === 'paper' ? '#0B0C0E' : '#3A3F47'} />

          <motion.path d={g.area} fill={c.area} initial={false} animate={{ d: g.area }} transition={pathT} />
          <motion.path d={g.prevD} fill="none" stroke={c.prev} strokeWidth={1.3} strokeDasharray="3 4" initial={false} animate={{ d: g.prevD }} transition={pathT} />
          <motion.path d={g.curD} fill="none" stroke={c.line} strokeWidth={2.4} strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }} animate={{ d: g.curD, pathLength: 1 }} transition={{ d: pathT, pathLength: { duration: 1.4, ease: EASE, delay: 0.15 } }} />

          <AnimatePresence initial={false}>
            <motion.g key={rangeKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {current.map((v, i) => {
                const h = (v / g.maxDaily) * (barBand - 6)
                const isPeak = i === g.peak
                return (
                  <motion.rect key={i} x={g.xi(i) - barW / 2} width={barW} rx={Math.min(1.5, barW / 3)}
                    fill={hover === i ? c.dot : isPeak ? c.peak : c.bar}
                    initial={reduce ? false : { y: barTop + barBand, height: 0 }} animate={{ y: barTop + barBand - h, height: h }}
                    transition={{ duration: 0.55, ease: EASE, delay: reduce ? 0 : 0.25 + i * (0.5 / N) }} />
                )
              })}
              {peakLabel && N > 0 && hover == null && (
                <g>
                  <line x1={g.xi(g.peak)} x2={g.xi(g.peak)} y1={22} y2={barTop + barBand - (current[g.peak] / g.maxDaily) * (barBand - 6) - 4} stroke={c.line} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                  <text x={Math.max(0, Math.min(plotW - peakLabel.length * 6.6 - 8, g.xi(g.peak) + 6))} y={18} textAnchor="start" className="font-mono uppercase" fontSize="10" letterSpacing="0.06em" fill={c.line}>{peakLabel}</text>
                </g>
              )}
            </motion.g>
          </AnimatePresence>

          {N > 0 && hover == null && (
            <motion.circle cx={plotW} cy={g.yv(g.cc[N - 1])} r={5} fill={c.dot} stroke={tone === 'paper' ? '#0B0C0E' : '#0B0C0E'} strokeWidth={1.8}
              initial={reduce ? false : { scale: 0 }} animate={{ scale: 1, cy: g.yv(g.cc[N - 1]) }} transition={{ delay: reduce ? 0 : 1.3, duration: 0.4, ease: EASE }} />
          )}

          {hover != null && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={8} y2={barTop + barBand} stroke={c.line} strokeWidth={1} />
              {g.pc[hover] != null && <circle cx={hx} cy={g.yv(g.pc[hover])} r={3.5} fill={tone === 'paper' ? '#F7F5F0' : '#0B0C0E'} stroke={c.prev} strokeWidth={1.5} />}
              <circle cx={hx} cy={g.yv(g.cc[hover])} r={5} fill={c.dot} stroke="#0B0C0E" strokeWidth={1.8} />
            </g>
          )}

          {N > 1 && [0, Math.floor((N - 1) / 2), N - 1].map((i) => (
            <text key={i} x={g.xi(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle'} className="font-mono uppercase" fontSize="10" letterSpacing="0.06em" fill={c.text}>{shortDate(dates[i])}</text>
          ))}
          <rect x={0} y={0} width={plotW} height={height - axisH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }} />
        </svg>
      )}
      <AnimatePresence>
        {hover != null && (
          <motion.div key="tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, left: Math.min(Math.max(hx - 90, 0), W - 230) }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            className="pointer-events-none absolute top-6 w-[220px] rounded-[6px] px-3.5 py-3 text-[12px] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
            style={{ background: c.tipBg, color: c.tipFg }}>
            <div className="label opacity-60">{shortDate(dates[hover])}</div>
            <div className="mt-1.5 flex justify-between gap-3"><span className="opacity-70">That day</span><span className="tnum font-mono">{inr(current[hover])}</span></div>
            <div className="mt-1 flex justify-between gap-3"><span className="opacity-70">Running total</span><span className="tnum font-mono">{inr(g.cc[hover])}</span></div>
            {g.pc[hover] != null && <div className="mt-1 flex justify-between gap-3"><span className="opacity-70">Same point before</span><span className="tnum font-mono">{inr(g.pc[hover])}</span></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
