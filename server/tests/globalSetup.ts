import { execFileSync } from 'node:child_process'
import pg from 'pg'

/** Recreates the test database schema from the migrations before the suite runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://opervia:opervia@localhost:5432/opervia_test'
  if (!/test/.test(url)) throw new Error('Refusing to reset a database whose URL does not contain "test".')
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  await c.end()
  execFileSync('npx', ['tsx', 'scripts/apply-migrations.ts'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
}
