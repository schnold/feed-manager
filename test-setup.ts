import { beforeAll } from 'vitest'

beforeAll(() => {
  // Set test environment variables
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.NODE_ENV = 'test'
})