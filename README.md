# Opervia

**Intelligent Operations. Clear Decisions.**

Opervia is a full-stack operations platform for small and mid-sized businesses: inventory, suppliers, customers, purchase orders, sales orders, invoices and payments, SQL-backed analytics, and an AI analyst that answers questions from the business's own records.

```
web/      React 19 · TypeScript · Vite · Tailwind 4 · TanStack Query · React Router · Framer Motion · Recharts · React Hook Form + Zod
server/   Node · Express 5 · TypeScript · Prisma 7 (pg adapter) · PostgreSQL · Zod · JWT cookies · Vitest + Supertest
```

## Run it locally

Requirements: Node 20.19+ and PostgreSQL 14+.

```bash
# 1. API
cd server
cp .env.example .env            # set DATABASE_URL and a long JWT_SECRET
npm install                     # also generates the Prisma client
npm run db:migrate              # prisma migrate deploy
npm run db:seed                 # demo workspace: 200 days of trading
npm run dev                     # http://localhost:4000

# 2. Web (second terminal)
cd web
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173 — /api is proxied to :4000
```

Open http://localhost:5173, choose **Open the demo**, and pick a role.

| Demo account | Password | Can |
| --- | --- | --- |
| admin@opervia.demo | Demo@1234 | everything, incl. people and audit log |
| manager@opervia.demo | Demo@1234 | operations, purchasing, invoices, analytics |
| staff@opervia.demo | Demo@1234 | orders, customers, receiving — no financial analytics |

Re-seed the demo with `npm run db:reset-demo`. Only workspaces flagged `isDemo` are ever deleted, and in production the seed refuses to run unless `ALLOW_DEMO_RESET=true` is set.

### Docker

```bash
docker compose up --build                                 # web on :8080, API on :4000, Postgres on :5432
docker compose exec server node dist/prisma/seed.js       # first time only
```

The web container's nginx proxies `/api` to the API, so cookies stay first-party.

## What is in it

- **Inventory** — products, categories, reorder levels, days of cover from real sell-through, stock gauges, archive-not-delete, manual adjustments with reasons, and a per-product movement ledger with balance history.
- **Purchasing** — draft → ordered → partially received → received. Stock rises only on receipt; receipts are guarded so a line can never be received beyond what was ordered.
- **Sales** — draft → confirmed → processing → completed, or cancelled. Confirming deducts stock inside one transaction with conditional updates, so two simultaneous confirmations can't oversell; cancelling restores stock exactly once.
- **Invoices** — issued from an order's own lines (later price changes never alter them), partial payments, overpayment rejected under a row lock, void for unpaid invoices, PDF download. Payments are labelled as demo bookkeeping.
- **Analytics** — revenue, orders, AOV, gross margin and profit, sales against purchases, top products and customers, category mix, receivables and inventory value. All SQL aggregates with documented definitions.
- **AI analyst** — seven typed, read-only, permission-checked tools. The model (Anthropic) chooses a tool and explains the validated result; it never sees the database or writes SQL. Without an API key, or if the provider fails, answers are built from the same tools by rules, and the UI says so.
- **Access** — ADMIN / MANAGER / STAFF enforced on the server; every record is scoped to its workspace, so changing an ID in a URL returns 404.

### State machines

```
Sales order     DRAFT → CONFIRMED → PROCESSING → COMPLETED
                DRAFT | CONFIRMED | PROCESSING → CANCELLED   (stock returned once if it was reserved)
Purchase order  DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED
                DRAFT | ORDERED (nothing received) → CANCELLED
Invoice         UNPAID → PARTIALLY_PAID → PAID;  UNPAID (no payments) → VOID
```

### Metric definitions

- **Revenue**: confirmed, processing and completed orders; subtotal minus discount, before tax; dated by confirmation, in IST.
- **Gross margin**: (revenue − Σ unit cost × quantity) ÷ revenue. Unit cost is captured on each order line.
- **Outstanding**: invoice total − recorded payments, for unpaid and partly paid invoices.
- **Days of cover**: units on hand ÷ average daily units sold over the last 30 days.
- **Inventory value**: units on hand × current cost price, active products.

## Security

- Passwords hashed with bcrypt (cost 12). Sessions are HS256 JWTs in an HTTP-only cookie; the user is reloaded on every request so deactivation and role changes take effect immediately (`tokenVersion`).
- CSRF: double-submit token required on every state-changing request.
- Rate limits on sign-in/registration (10 per 15 min per IP) and the assistant (20 per minute per user).
- Helmet headers, strict CORS allow-list, 100 kB body limit, Zod validation on every input, centralised errors without stack traces, request logs without bodies or cookies.
- Optional `Idempotency-Key` on stock and money operations (receipts, confirmations, cancellations, payments, adjustments).
- Database CHECK constraints: stock never negative, received ≤ ordered, paid ≤ total, discount ≤ subtotal.

## API

All responses are `{ success, data }` or `{ success: false, code, message, errors? }`. Unsafe methods need `X-CSRF-Token` (from `GET /api/auth/csrf`).

| Area | Endpoints |
| --- | --- |
| Auth | `GET /auth/csrf` · `POST /auth/register` · `POST /auth/login` · `POST /auth/demo` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` |
| Products | `GET /products` (q, stock, category, status, sort, page) · `GET /products/:id` · `POST /products` · `PATCH /products/:id` · `POST /products/:id/adjust` · `POST /products/:id/archive` · `/restore` · `DELETE /products/:id` · `GET/POST /products/categories` |
| Suppliers / Customers | `GET /suppliers` · `GET /suppliers/:id` · `POST` · `PATCH` · `DELETE` (same shape for `/customers`) |
| Purchase orders | `GET /purchase-orders` · `GET /:id` · `POST` · `PUT /:id` (draft) · `POST /:id/submit` · `POST /:id/receive` · `POST /:id/cancel` |
| Sales orders | `GET /sales-orders` · `GET /:id` · `POST` · `PUT /:id` (draft) · `POST /:id/confirm` · `/process` · `/complete` · `/cancel` |
| Invoices | `GET /invoices` · `GET /:id` · `POST /invoices` · `POST /:id/payments` · `POST /:id/void` · `GET /:id/pdf` |
| Analytics | `GET /analytics/overview?range=7d|30d|90d` · `GET /analytics/report?from&to` |
| Assistant | `GET /assistant/status` · `POST /assistant/ask` |
| Admin | `GET/PATCH /settings` · `GET/POST /users` · `PATCH /users/:id` · `GET /audit` |
| Health | `GET /health` |

## Tests

```bash
cd server && npm test     # 19 API tests against a real Postgres (TEST_DATABASE_URL, must contain "test")
cd web && npm test        # formatting and query helpers
```

The API suite covers sessions and CSRF, role limits, workspace isolation, partial and idempotent receiving, overselling under concurrent confirmation, single stock restoration, invoice immutability, concurrent overpayment, PDF output, analytics figures, and the assistant with a scripted model (tool choice, malformed replies, timeouts, unsupported questions).

## Deploying

- **Same site (recommended):** serve the web build and proxy `/api` to the API (nginx config included, or Vercel rewrites to a Render/Railway API). Keep `COOKIE_SAMESITE=lax`.
- **Different sites:** set `COOKIE_SAMESITE=none`, serve both over HTTPS, set `CORS_ORIGIN` to the web origin and `VITE_API_URL` to the API URL.
- Set `TRUST_PROXY=true` behind a load balancer so rate limits see client IPs.

## Notes and limits

- Tax is a single configurable rate per business (default GST 18%) applied to subtotal minus discount. It is not a GST compliance engine.
- Payments are bookkeeping records marked as demo; no payment provider is connected.
- The initial migration SQL was written to match `schema.prisma` and applied with `npm run db:migrate:sql` in an environment where Prisma's migration engine couldn't be downloaded. On a normal machine, confirm there is no drift with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <empty-db-url>`.
- `web/` has a `build:preview` mode that bundles a static demo dataset for hosting without a server; it is labelled as a static preview in the app.
