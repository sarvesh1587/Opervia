import type { Role } from '../generated/prisma/enums.js'

export interface AuthContext { userId: string; businessId: string; role: Role; name: string; email: string }

const ALL: Role[] = ['ADMIN', 'MANAGER', 'STAFF']
const MGMT: Role[] = ['ADMIN', 'MANAGER']
const ADMIN: Role[] = ['ADMIN']

/** Single source of truth for what each role may do. Enforced by the API; the UI only mirrors it. */
export const PERMISSIONS = {
  'products:read': ALL,
  'products:write': MGMT,
  'products:adjust': MGMT,
  'suppliers:read': ALL,
  'suppliers:write': MGMT,
  'customers:read': ALL,
  'customers:write': ALL,
  'purchaseOrders:read': ALL,
  'purchaseOrders:write': MGMT,
  'purchaseOrders:receive': ALL,
  'salesOrders:read': ALL,
  'salesOrders:write': ALL,
  'salesOrders:cancel': MGMT,
  'invoices:read': ALL,
  'invoices:write': MGMT,
  'payments:write': MGMT,
  'analytics:read': MGMT,
  'assistant:use': ALL,
  'audit:read': ADMIN,
  'users:manage': ADMIN,
  'settings:write': ADMIN,
} as const satisfies Record<string, Role[]>

export type Permission = keyof typeof PERMISSIONS
export const can = (role: Role, p: Permission) => (PERMISSIONS[p] as readonly Role[]).includes(role)
export const permissionsFor = (role: Role) => (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p))
