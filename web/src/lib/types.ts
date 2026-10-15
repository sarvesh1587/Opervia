// Shapes returned by the Opervia API inside { success: true, data }. Money arrives as numbers with two decimals.

export type Range = '7d' | '30d' | '90d'
export type Role = 'ADMIN' | 'MANAGER' | 'STAFF'
export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED'
export type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
export type StockState = 'ok' | 'low' | 'out'
export type Permission =
  | 'products:read' | 'products:write' | 'products:adjust' | 'suppliers:read' | 'suppliers:write' | 'customers:read' | 'customers:write'
  | 'purchaseOrders:read' | 'purchaseOrders:write' | 'purchaseOrders:receive' | 'salesOrders:read' | 'salesOrders:write' | 'salesOrders:cancel'
  | 'invoices:read' | 'invoices:write' | 'payments:write' | 'analytics:read' | 'assistant:use' | 'audit:read' | 'users:manage' | 'settings:write'

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; pages: number }

export interface Session {
  user: { id: string; name: string; email: string; role: Role }
  business: { id: string; name: string; city: string | null; currency: string; taxRate: number; taxLabel: string; paymentTermsDays: number; isDemo: boolean }
  permissions: Permission[]
  ai: { configured: boolean }
}

export interface LedgerMetric { key: string; label: string; value: number; format: 'inr' | 'count' | 'pct'; note: string; trend: number[]; attention?: boolean; href: string }
export interface OverviewStockItem { id: string; sku: string; name: string; category: string; onHand: number; reorderAt: number; dailySales: number; state: StockState }
export interface OrderLine { product: string; sku: string; qty: number; unitPrice: number }
export interface OrderRow { id: string; number: string; customer: string; placedAt: string; status: OrderStatus; total: number; lines: OrderLine[] }
export interface ActivityItem { id: string; at: string; actor: string; kind: 'stock-in' | 'payment' | 'order' | 'alert' | 'invoice'; text: string }

export interface Overview {
  business: { name: string; city: string }
  user: { name: string; initials: string; role: Role }
  range: Range
  period: { label: string; compareLabel: string }
  /** null for roles without analytics access */
  revenue: { total: number; previousTotal: number; changePct: number; peak: { date: string; value: number; customer: string } } | null
  series: { dates: string[]; current: number[]; previous: number[] } | null
  ledger: LedgerMetric[] | null
  stock: { items: OverviewStockItem[]; healthy: number; low: number; out: number; valueAtCost: number | null }
  orders: OrderRow[]
  orderCounts: { all: number; open: number; completed: number; cancelled: number }
  activity: ActivityItem[]
  meta: { rowsScanned: number; generatedAt: string; source: 'api' | 'demo'; scope?: 'full' | 'operational' }
}

export interface AssistantAnswer {
  id: string
  question: string
  tool: string | null
  args: Record<string, unknown>
  summary: string
  metrics?: { label: string; value: string }[]
  table?: { columns: string[]; rows: string[][] }
  followUps: string[]
  mode: 'llm' | 'offline'
  ms: number
  notice?: string
}

export interface Ref { id: string; name: string }

export interface Product {
  id: string; sku: string; name: string; description: string | null
  category: Ref | null; supplier: Ref | null; categoryId: string | null; supplierId: string | null
  costPrice: number; sellingPrice: number; stockQty: number; reorderLevel: number
  status: 'ACTIVE' | 'ARCHIVED'; state: StockState; dailySales: number; coverDays: number | null
  createdAt: string; updatedAt: string
}
export interface Movement { id: string; type: 'OPENING' | 'PURCHASE_RECEIPT' | 'SALE' | 'SALE_CANCELLED' | 'ADJUSTMENT'; quantity: number; balanceAfter: number; reference: string | null; note: string | null; createdAt: string; user: { name: string } | null }
export interface ProductDetail extends Product { sold30: number; incoming: number; movements: Movement[] }
export interface Category { id: string; name: string; productCount: number }

export interface Party {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; gstin: string | null
  status: 'ACTIVE' | 'INACTIVE'; createdAt: string
}
export interface SupplierRow extends Party { productCount: number; purchaseOrderCount: number; openOrderValue: number; receivedValue: number; lastOrderedAt: string | null }
export interface SupplierDetail extends Party {
  products: { id: string; sku: string; name: string; stockQty: number; reorderLevel: number; costPrice: number }[]
  purchaseOrders: { id: string; number: string; status: POStatus; total: number; orderedAt: string | null; expectedAt: string | null; receivedAt: string | null; createdAt: string }[]
  totals: { status: POStatus; count: number; value: number }[]
}
export interface CustomerRow extends Party { totalPurchases: number; orderCount: number; outstanding: number; lastOrderAt: string | null }
export interface CustomerDetail extends CustomerRow {
  salesOrders: { id: string; number: string; status: OrderStatus; total: number; createdAt: string; confirmedAt: string | null }[]
  invoices: { id: string; number: string; status: InvoiceStatus; total: number; amountPaid: number; issueDate: string; dueDate: string }[]
}

export interface POItem { id: string; productId: string; quantity: number; receivedQty: number; unitCost: number; lineTotal: number; product: { id: string; sku: string; name: string; stockQty: number } }
export interface PurchaseOrderRow { id: string; number: string; status: POStatus; supplier: Ref; total: number; subtotal: number; taxAmount: number; orderedAt: string | null; expectedAt: string | null; receivedAt: string | null; createdAt: string; lineCount: number; orderedUnits: number; receivedUnits: number }
export interface PurchaseOrder extends Omit<PurchaseOrderRow, 'lineCount' | 'orderedUnits' | 'receivedUnits' | 'supplier'> {
  supplier: Ref & { email: string | null; phone: string | null }
  notes: string | null; items: POItem[]; allowedTransitions: POStatus[]; createdBy: { name: string } | null
  receipts?: { id: string; quantity: number; createdAt: string; note: string | null; product: { name: string; sku: string }; user: { name: string } | null }[]
}

export interface SOItem { id: string; productId: string; quantity: number; unitPrice: number; unitCost?: number; lineTotal: number; product: { id: string; sku: string; name: string; stockQty: number; status: string } }
export interface SalesOrderRow { id: string; number: string; status: OrderStatus; customer: Ref; total: number; subtotal: number; discount: number; createdAt: string; confirmedAt: string | null; lineCount: number; invoice: { id: string; number: string; status: InvoiceStatus } | null }
export interface SalesOrder {
  id: string; number: string; status: OrderStatus; customer: Ref & { email: string | null; phone: string | null }
  subtotal: number; discount: number; taxRate: number; taxAmount: number; total: number; notes: string | null; stockApplied: boolean
  confirmedAt: string | null; completedAt: string | null; cancelledAt: string | null; createdAt: string
  items: SOItem[]; invoice: { id: string; number: string; status: InvoiceStatus; total: number; amountPaid: number } | null
  allowedTransitions: OrderStatus[]; createdBy: { name: string } | null
  history?: { id: string; action: string; summary: string; createdAt: string; user: { name: string } | null }[]
}

export interface InvoiceRow { id: string; number: string; status: InvoiceStatus; customer: Ref; salesOrder: { id: string; number: string }; issueDate: string; dueDate: string; total: number; amountPaid: number; outstanding: number; overdue: boolean; daysOverdue: number }
export interface Invoice extends Omit<InvoiceRow, 'customer'> {
  customer: Party
  subtotal: number; discount: number; taxRate: number; taxAmount: number
  items: { id: string; description: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }[]
  payments: { id: string; amount: number; method: string; reference: string | null; paidAt: string; isDemo: boolean; user: { name: string } | null }[]
  business: { name: string; city: string | null; taxLabel: string; currency: string }
}

export interface Report {
  range: { from: string; to: string; days: number; interval: 'day' | 'week' | 'month' }
  previousRange: { from: string; to: string }
  summary: { revenue: number; orders: number; aov: number; cogs: number; grossProfit: number; margin: number; unitsSold: number }
  previous: Report['summary']
  series: { date: string; revenue: number; orders: number; purchases: number }[]
  topProducts: { id: string; sku: string; name: string; revenue: number; quantity: number; profit: number }[]
  topCustomers: { id: string; name: string; revenue: number; orders: number }[]
  categories: { category: string; revenue: number }[]
  receivables: { outstanding: number; overdue: number; overdueCount: number; openCount: number }
  inventory: { atCost: number; atRetail: number; skus: number; units: number }
}

export interface UserRow { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: string | null; createdAt: string }
export interface AuditRow { id: string; action: string; entity: string; entityId: string | null; summary: string; createdAt: string; user: { name: string } | null }
