import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './config/env.js'
import { Prisma, PrismaClient } from './generated/prisma/client.js'

// Money is computed with Decimal on the server and sent to clients as numbers with two decimals.
;(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return Number(this.toFixed(2))
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })
export type Tx = Prisma.TransactionClient
export { Prisma }
