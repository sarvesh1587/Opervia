import 'dotenv/config'
import { z } from 'zod'

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 7).default(8),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: bool,
  DEMO_LOGIN_ENABLED: bool,
  ALLOW_DEMO_RESET: bool,
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-haiku-5-5'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  LOG_REQUESTS: z.enum(['true', 'false']).optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:')
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

const e = parsed.data
export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  corsOrigins: e.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
  logRequests: e.LOG_REQUESTS ? e.LOG_REQUESTS === 'true' : e.NODE_ENV !== 'test',
  aiConfigured: Boolean(e.ANTHROPIC_API_KEY && e.ANTHROPIC_API_KEY.trim()),
}
