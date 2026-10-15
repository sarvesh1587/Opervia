import { Prisma, type Tx } from '../db.js'

/** Atomically allocates the next document number for a business, e.g. SO-0419. */
export async function nextNumber(tx: Tx, businessId: string, key: 'SO' | 'PO' | 'INV' | 'SKU', width = 4) {
  const rows = await tx.$queryRaw<{ value: number }[]>(Prisma.sql`
    INSERT INTO "Counter" ("businessId", "key", "value") VALUES (${businessId}, ${key}, 1)
    ON CONFLICT ("businessId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`)
  return `${key}-${String(rows[0].value).padStart(width, '0')}`
}
