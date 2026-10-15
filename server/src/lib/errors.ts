export class AppError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details)
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'Your role does not allow this action.') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found.`)
export const conflict = (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details)
export const unprocessable = (message: string, details?: unknown) => new AppError(422, 'UNPROCESSABLE', message, details)
