import type { AssistantAnswer, Overview, Range } from './types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

/** Static-preview mode: serves the bundled demo dataset instead of calling the API. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_DATA === 'true'

export class ApiError extends Error {
  status: number
  code: string
  fieldErrors: Record<string, string>
  details?: Record<string, unknown>
  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

let csrfToken: string | null = null
let csrfPromise: Promise<string> | null = null
async function csrf(force = false) {
  if (force) { csrfToken = null; csrfPromise = null }
  if (csrfToken) return csrfToken
  csrfPromise ??= fetch(`${BASE}/auth/csrf`, { credentials: 'include' })
    .then((r) => r.json())
    .then((b) => (csrfToken = b.data.csrfToken as string))
    .catch((e) => { csrfPromise = null; throw new ApiError(0, 'NETWORK', 'Cannot reach the Opervia server. Check your connection and try again.', {}, { cause: String(e) }) })
  return csrfPromise
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
interface Options { idempotencyKey?: string; signal?: AbortSignal; retried?: boolean }

async function request<T>(method: Method, path: string, body?: unknown, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrf()
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'include', signal: opts.signal, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', 'Cannot reach the Opervia server. Check your connection and try again.')
  }
  const json = await res.json().catch(() => null)
  if (res.ok && json?.success) return json.data as T

  const code = json?.code ?? 'HTTP'
  if (res.status === 403 && code === 'CSRF' && !opts.retried) { await csrf(true); return request<T>(method, path, body, { ...opts, retried: true }) }
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('opervia:unauthorized', { detail: json?.message }))
  const fieldErrors: Record<string, string> = {}
  for (const e of (json?.errors ?? []) as { path: string; message: string }[]) fieldErrors[e.path] ??= e.message
  throw new ApiError(res.status, code, json?.message ?? `Request failed (${res.status}).`, fieldErrors, json?.details)
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, { signal }),
  post: <T>(path: string, body: unknown = {}, opts?: Options) => request<T>('POST', path, body, opts),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Downloads a file through fetch so the session cookie is sent, then saves it with an object URL. */
  async download(path: string, filename: string) {
    const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD', 'The file could not be generated.')
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  },
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}

const latency = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const api = {
  async overview(range: Range): Promise<Overview> {
    if (!DEMO_MODE) return http.get<Overview>(`/analytics/overview?range=${range}`)
    const { buildOverview } = await import('../demo/data')
    await latency(380)
    return buildOverview(range) as Overview
  },
  async ask(question: string): Promise<AssistantAnswer> {
    if (!DEMO_MODE) return http.post<AssistantAnswer>('/assistant/ask', { question })
    const { answerOffline } = await import('../demo/data')
    await latency(900)
    return answerOffline(question)
  },
}
