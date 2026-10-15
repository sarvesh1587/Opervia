const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const inr = (n: number) => `₹${inrFmt.format(Math.round(n))}`

export const lakh = (n: number) => {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  return inr(n)
}

export const pct = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`

export const count = (n: number) => inrFmt.format(Math.round(n))

export const formatMetric = (value: number, format: 'inr' | 'count' | 'pct') =>
  format === 'inr' ? inr(value) : format === 'pct' ? `${value.toFixed(1)}%` : count(value)

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

export const longDate = (d = new Date()) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
