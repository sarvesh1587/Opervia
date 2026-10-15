import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://opervia:opervia@localhost:5432/opervia_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      DEMO_LOGIN_ENABLED: 'false',
      ANTHROPIC_API_KEY: '',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
