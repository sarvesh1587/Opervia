import type { Response } from 'express'

export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data })

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; pages: number }
export const page = <T>(items: T[], total: number, p: number, size: number): Page<T> => ({ items, page: p, pageSize: size, total, pages: Math.max(1, Math.ceil(total / size)) })
