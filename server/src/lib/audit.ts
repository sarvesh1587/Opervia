import type { Tx } from '../db.js'
import type { AuthContext } from '../auth/permissions.js'
import type { Prisma } from '../generated/prisma/client.js'

export async function audit(tx: Tx, ctx: Pick<AuthContext, 'businessId' | 'userId'>, entry: { action: string; entity: string; entityId?: string; summary: string; metadata?: Prisma.InputJsonValue }) {
  await tx.auditLog.create({ data: { businessId: ctx.businessId, userId: ctx.userId, ...entry } })
}
