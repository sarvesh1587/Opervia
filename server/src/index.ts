import { createApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './db.js'
import { logger } from './lib/logger.js'

const server = createApp().listen(env.PORT, () => logger.info('server_started', { port: env.PORT, env: env.NODE_ENV, ai: env.aiConfigured }))

const shutdown = (signal: string) => {
  logger.info('shutdown', { signal })
  server.close(async () => { await prisma.$disconnect(); process.exit(0) })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
