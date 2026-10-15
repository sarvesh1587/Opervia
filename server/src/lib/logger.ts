type Level = 'info' | 'warn' | 'error'
const write = (level: Level, msg: string, meta?: Record<string, unknown>) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta })
  if (level === 'error') console.error(line)
  else console.log(line)
}
export const logger = {
  info: (m: string, meta?: Record<string, unknown>) => write('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write('error', m, meta),
}
