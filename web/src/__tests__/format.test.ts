import { describe, expect, it } from 'vitest'
import { qs } from '../lib/api'
import { formatMetric, inr, lakh, pct } from '../lib/format'

describe('number formatting', () => {
  it('uses Indian digit grouping for rupees', () => {
    expect(inr(1908098)).toBe('₹19,08,098')
    expect(inr(999.6)).toBe('₹1,000')
  })
  it('abbreviates lakhs and crores', () => {
    expect(lakh(482300)).toBe('₹4.8L')
    expect(lakh(25_000_000)).toBe('₹2.50 Cr')
    expect(lakh(64000)).toBe('₹64,000')
  })
  it('signs percentages with a true minus', () => {
    expect(pct(7.84)).toBe('+7.8%')
    expect(pct(-2)).toBe('−2.0%')
    expect(formatMetric(25.83, 'pct')).toBe('25.8%')
  })
})

describe('query strings', () => {
  it('drops empty values', () => {
    expect(qs({ q: '', page: 2, status: undefined, stock: 'low' })).toBe('?page=2&stock=low')
    expect(qs({})).toBe('')
  })
})
