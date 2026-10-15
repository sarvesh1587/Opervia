import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, CornerDownRight, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAsk } from '../hooks/queries'
import { DEMO_MODE } from '../lib/api'
import { useAuth } from './auth'
import type { AssistantAnswer } from '../lib/types'
import { EASE } from '../components/ui/primitives'

type Turn = { id: string; question: string; answer?: AssistantAnswer; error?: string }

const SUGGESTIONS = [
  { q: 'Which products need restocking?', financial: false },
  { q: 'Compare this month’s revenue with last month', financial: true },
  { q: 'Which invoices are overdue?', financial: false },
  { q: 'Top products by revenue this month', financial: true },
  { q: 'Which orders are still pending?', financial: false },
  { q: 'What is my inventory worth?', financial: true },
  { q: 'Summarise the last 30 days', financial: true },
]

export function AssistantMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5.75" y="5.75" width="9.5" height="9.5" fill="#CDF545" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function Words({ text }: { text: string }) {
  const words = text.split(' ')
  return (
    <motion.p className="text-[15px] leading-[1.6] text-paper-50/90" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.018 } } }}>
      {words.map((w, i) => (
        <motion.span key={i} className="inline-block whitespace-pre" variants={{ h: { opacity: 0, y: 4, filter: 'blur(3px)' }, v: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: EASE } } }}>
          {w + (i < words.length - 1 ? ' ' : '')}
        </motion.span>
      ))}
    </motion.p>
  )
}

function Thinking({ tool }: { tool: string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11.5px] text-ink-300">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-1.5 w-1.5 bg-lime" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </span>
      <span role="status">Selecting a tool and querying {tool}</span>
    </div>
  )
}

export function Answer({ a, onAsk }: { a: AssistantAnswer; onAsk: (q: string) => void }) {
  return (
    <div className="space-y-4">
      {a.tool && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-300">
          <span className="rounded-[3px] border border-lime/50 px-1.5 py-0.5 text-lime">{a.tool}</span>
          {Object.entries(a.args).map(([k, v]) => <span key={k}>{k}={String(v)}</span>)}
          <span>· {a.ms} ms · read-only · {a.mode === 'llm' ? 'explained by AI' : 'offline'}</span>
        </motion.div>
      )}
      {a.notice && <p className="border-l-2 border-lime pl-3 text-[12.5px] text-ink-300">{a.notice}</p>}
      <Words text={a.summary} />
      {a.metrics && (
        <motion.dl initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
          className="grid grid-cols-3 divide-x divide-ink-700 border-y border-ink-700">
          {a.metrics.map((m) => (
            <div key={m.label} className="px-3 py-3 first:pl-0">
              <dt className="label text-ink-400">{m.label}</dt>
              <dd className="mt-1.5 font-serif text-[26px] leading-none tnum text-paper-50">{m.value}</dd>
            </div>
          ))}
        </motion.dl>
      )}
      {a.table && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease: EASE }} className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-[12.5px]">
            <thead>
              <tr>{a.table.columns.map((c, i) => <th key={c} scope="col" className={`label border-b border-ink-600 pb-2 font-normal text-ink-400 ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {a.table.rows.map((r, ri) => (
                <motion.tr key={ri} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + ri * 0.04 }} className="border-b border-ink-800 hover:bg-ink-850">
                  {r.map((cell, ci) => <td key={ci} className={`py-2 ${ci ? 'tnum text-right font-mono text-[12px] text-ink-300' : 'text-paper-50'}`}>{cell}</td>)}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {a.followUps.map((f) => (
          <button key={f} onClick={() => onAsk(f)} className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-3 py-1.5 text-[12.5px] text-ink-300 transition-colors hover:border-lime/60 hover:text-paper-50">
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />{f}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AssistantPanel({ initialQuestion, onClose, variant = 'drawer' }: { initialQuestion?: string | null; onClose?: () => void; variant?: 'drawer' | 'page' }) {
  const { ai, can } = useAuth()
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const ask = useAsk()
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const asked = useRef<string | null>(null)

  const submit = (q: string) => {
    const question = q.trim()
    if (!question || ask.isPending) return
    const id = Math.random().toString(36).slice(2)
    setTurns((t) => [...t, { id, question }])
    setInput('')
    ask.mutate(question, {
      onSuccess: (answer) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer } : x))),
      onError: (e) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: e instanceof Error ? e.message : 'The assistant could not answer.' } : x))),
    })
  }

  useEffect(() => {
    if (initialQuestion && asked.current !== initialQuestion) { asked.current = initialQuestion; submit(initialQuestion) }
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [turns])

  return (
    <div className="on-ink flex h-full flex-col bg-ink-950 text-paper-50">
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <AssistantMark className="h-4 w-4 text-paper-50" />
          <div>
            <div className="text-[14px] font-medium">Ask Opervia</div>
            <div className="label text-ink-400">{DEMO_MODE || !ai.configured ? 'Offline mode · no AI key set · answers built from tool results' : 'AI on · answers from your records only'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {turns.length > 0 && (
            <button onClick={() => setTurns([])} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-ink-300 hover:bg-ink-850 hover:text-paper-50" aria-label="Start a new conversation">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />New
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-ink-300 hover:bg-ink-850 hover:text-paper-50" aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={scroller} className={`flex-1 overflow-y-auto px-5 py-6 ${variant === 'page' ? 'md:px-10' : ''}`}>
        {turns.length === 0 ? (
          <motion.div initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}>
            <motion.h2 variants={{ h: { opacity: 0, y: 8 }, v: { opacity: 1, y: 0 } }} className="font-serif text-[34px] leading-[1.02] tracking-[-0.01em]">
              Ask about revenue, stock, orders or dues.
            </motion.h2>
            <motion.p variants={{ h: { opacity: 0 }, v: { opacity: 1 } }} className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-ink-300">
              Each question is routed to one of seven read-only tools. The query runs on the server with your role’s permissions; nothing is made up.
            </motion.p>
            <div className="mt-7 border-t border-ink-800">
              {SUGGESTIONS.filter((s) => can('analytics:read') || !s.financial).map(({ q: s }, i) => (
                <motion.button key={s} variants={{ h: { opacity: 0, x: -6 }, v: { opacity: 1, x: 0 } }} onClick={() => submit(s)}
                  className="group flex w-full items-center justify-between border-b border-ink-800 py-3 text-left text-[14px] text-ink-300 transition-colors hover:text-paper-50">
                  <span><span className="mr-3 font-mono text-[11px] text-ink-600">{String(i + 1).padStart(2, '0')}</span>{s}</span>
                  <span className="text-lime opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true">→</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="space-y-9">
            <AnimatePresence initial={false}>
              {turns.map((t) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="space-y-4">
                  <div className="font-serif text-[24px] leading-[1.15] text-paper-50">{t.question}</div>
                  {t.answer ? <Answer a={t.answer} onAsk={submit} /> : t.error ? (
                    <div className="rounded-[6px] border border-ink-700 p-4 text-[13.5px]" role="alert">
                      <div className="text-paper-50">The assistant couldn’t answer: {t.error}</div>
                      <button onClick={() => { setTurns((x) => x.filter((y) => y.id !== t.id)); submit(t.question) }} className="mt-3 text-[12.5px] text-lime link-underline">Try again</button>
                    </div>
                  ) : <Thinking tool="your records" />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(input) }} className="border-t border-ink-800 p-4">
        <label htmlFor="ask-input" className="sr-only">Ask a question about your business</label>
        <div className="flex items-end gap-2 rounded-[10px] border border-ink-700 bg-ink-900 p-2 pl-3.5 transition-colors focus-within:border-lime/60">
          <textarea id="ask-input" ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input) } }}
            placeholder="Which customers owe us the most?" className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] text-paper-50 outline-none placeholder:text-ink-400" />
          <button type="submit" disabled={!input.trim() || ask.isPending} aria-label="Send question"
            className="grid h-9 w-9 place-items-center rounded-[7px] bg-lime text-ink-950 transition-transform active:scale-95 disabled:opacity-30">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
