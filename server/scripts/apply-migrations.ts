/**
 * Applies prisma/migrations/*.sql with plain `pg`, recording them in _prisma_migrations exactly as
 * `prisma migrate deploy` does. Use it where Prisma's migration engine binary cannot be downloaded;
 * `prisma migrate deploy` remains the primary path and treats migrations applied here as done.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import 'dotenv/config'

const dir = join(import.meta.dirname, '..', 'prisma', 'migrations')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`)
  const done = new Set((await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map((r) => r.migration_name))
  for (const name of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    if (done.has(name)) continue
    const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8')
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count) VALUES ($1, $2, $3, now(), 1)`, [randomUUID(), createHash('sha256').update(sql).digest('hex'), name])
    await client.query('COMMIT')
    console.log(`Applied ${name}`)
  }
  console.log('Database schema is up to date.')
} catch (e) {
  await client.query('ROLLBACK').catch(() => undefined)
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await client.end()
}
