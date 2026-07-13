# Data model and API

Status: authoritative untuk persistence, authentication, tenancy, constraints, dan HTTP contract.

## Architecture boundary

Frontend tidak mengakses database langsung. Backend memegang authorization, tenant scoping, validation, domain transactions, audit, dan derived metrics.

P0 stack: TypeScript, Next.js frontend, Express API, Prisma, dan PostgreSQL. Stack dapat berubah hanya jika execution plan dan deployment plan ikut diperbarui.

## Authentication and tenancy

- Password di-hash dengan bcrypt cost 12 untuk P0; parameter dapat dinaikkan setelah benchmark production.
- Successful login membuat opaque server session atau signed session identifier dalam cookie `HttpOnly`, `Secure` di production, dan `SameSite=Lax`.
- Session menyimpan `userId`, active `organizationId`, role, expiry, dan revocation state.
- Backend mengambil tenant dari session; `organizationId` dari body, query, atau path tidak dipercaya.
- Semua tenant-owned repository methods mewajibkan organization context.
- Resource dari tenant lain merespons `404` untuk mengurangi enumeration.
- Deactivated user/session ditolak pada request berikutnya.

Role P0:

- `OWNER`: seluruh operator capability plus member/settings/audit access.
- `OPERATOR`: seluruh collection capability tanpa member/settings management.

## Entity model

### Identity and tenancy

- **Organization:** `id`, `name`, `timezone`, timestamps.
- **User:** `id`, globally unique normalized `email`, `passwordHash`, `name`, `isActive`, timestamps.
- **Membership:** composite unique `(userId, organizationId)`, `role`, `isActive`, timestamps.
- **Session:** token hash/id, user, organization, expiry, revokedAt.

### Receivables

- **Debtor:** organization, optional external `code`, `name`, primary contact fields, timestamps, optional `deletedAt`.
- **Invoice:** organization, debtor, normalized/original invoice number, invoice/due dates, original amount, optional description, source import row, timestamps, optional `deletedAt`.
- **Communication:** organization, invoice, actor, occurredAt, channel, notes, nextFollowUpDate, timestamps.
- **PromiseToPay:** organization, invoice, amount, promiseDate, createdBy, finalStatus/fulfilledAt/cancelledAt/cancelReason, timestamps.
- **Dispute:** organization, invoice, category, details, status, createdBy, resolvedBy/resolvedAt/resolutionNote, timestamps.
- **Payment:** organization, debtor/payer reference, payment date, amount, bank reference, createdBy, timestamps.
- **PaymentAllocation:** organization, payment, invoice, amount, allocation date, createdBy, optional reversedAt/reason, timestamps.

### Import and audit

- **InvoiceImportJob:** organization, filename, file hash, status (`PREVIEWING`, `READY`, `COMMITTED`, `FAILED`, `CANCELLED`), counts, createdBy, timestamps.
- **InvoiceImportRow:** job, row number, normalized payload JSON, result (`VALID`, `INVALID`, `DUPLICATE`, `COMMITTED`), error code/message, committed invoice id.
- **AuditLog:** organization, optional actor, action, entity type/id, request ID, safe metadata JSON, timestamp.

## Relationships

```text
Organization 1 ── * Membership * ── 1 User
Organization 1 ── * Debtor 1 ── * Invoice
Invoice 1 ── * Communication
Invoice 1 ── * PromiseToPay
Invoice 1 ── * Dispute
Payment 1 ── * PaymentAllocation * ── 1 Invoice
InvoiceImportJob 1 ── * InvoiceImportRow
```

Tenant-owned child rows tetap membawa `organizationId` untuk defense in depth dan indexing, walau dapat diturunkan dari parent. Foreign-key consistency harus memastikan parent dan child berada dalam organization yang sama melalui application transaction dan tests.

## Constraints and indexes

- Unique invoice: `(organizationId, normalizedInvoiceNumber)` untuk row non-deleted.
- Unique debtor code when present: `(organizationId, normalizedCode)`.
- `originalAmount > 0`, payment/allocation/promise amount `> 0`.
- `dueDate >= invoiceDate`.
- Index setiap tenant table mulai dengan `organizationId`.
- Invoice query indexes: `(organizationId, dueDate)`, `(organizationId, debtorId)`, dan `(organizationId, deletedAt)`.
- Activity indexes: `(organizationId, invoiceId, occurredAt/createdAt)`.
- Import row unique: `(importJobId, rowNumber)`.
- Audit indexes: `(organizationId, timestamp)` dan `(organizationId, entityType, entityId)`.
- Money invariants yang melibatkan sums dijaga dalam transaction, bukan hanya check constraint.

`outstanding`, aging, promise date status, queue eligibility, dan dashboard totals adalah derived values sesuai [Domain rules](03-domain-rules.md). Jangan menjadikan stale persisted copies sebagai sumber kebenaran.

## HTTP conventions

- Base path: `/api`.
- JSON kecuali CSV upload/download dan print response.
- Dates: `YYYY-MM-DD`; timestamps: ISO 8601 UTC.
- Currency amounts dikirim sebagai decimal strings, contoh `"150000000.00"`.
- Pagination: `?page=1&limit=25`, limit maksimum 100.
- Stable error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request is invalid",
    "fields": { "amount": "Must be greater than zero" },
    "requestId": "..."
  }
}
```

Status: `400` validation, `401` unauthenticated, `403` forbidden capability, `404` missing/cross-tenant, `409` duplicate/conflict, `415` media type, `422` domain invariant, `500` unexpected.

Mutating requests menerima `Idempotency-Key` untuk import commit dan payment allocation, atau menerapkan equivalent unique operation key agar retry tidak menggandakan uang/data.

## Endpoint inventory

### Health and auth

- `GET /health` — liveness/readiness tanpa sensitive details.
- `POST /api/auth/login` — public; rate-limited.
- `POST /api/auth/logout` — revoke session.
- `GET /api/auth/me` — user, active organization, role.

### Organization and members

- `GET /api/organization` — current organization.
- `PATCH /api/organization` — Owner.
- `GET /api/members` — Owner.
- `POST /api/members` — Owner creates membership/user.
- `PATCH /api/members/:id` — Owner changes role/active state.

### Debtors

- `GET /api/debtors?search=&page=&limit=`.
- `POST /api/debtors`.
- `GET /api/debtors/:id` — identity plus aggregate summary.
- `PATCH /api/debtors/:id`.

Hard delete bukan P0.

### Invoices and dashboard

- `GET /api/invoices?search=&debtorId=&state=&agingBucket=&disputed=&page=&limit=`.
- `GET /api/invoices/:id` — invoice plus related activity.
- `GET /api/dashboard?asOfDate=` — dashboard metrics.

Manual invoice create/edit/delete bukan P0; corrections dilakukan melalui controlled admin process sampai kebutuhan pilot jelas.

### Imports

- `POST /api/imports/invoices/preview` — multipart CSV; creates preview job.
- `GET /api/imports/:id` — job summary.
- `GET /api/imports/:id/rows?result=&page=&limit=` — row results.
- `POST /api/imports/:id/commit` — idempotent commit valid rows.
- `POST /api/imports/:id/cancel` — cancel uncommitted job.

### Collection activity

- `GET /api/collection-queue?asOfDate=&page=&limit=`.
- `POST /api/invoices/:id/communications`.
- `POST /api/invoices/:id/promises`.
- `POST /api/promises/:id/cancel`.
- `POST /api/invoices/:id/disputes`.
- `POST /api/disputes/:id/resolve`.

Activity editing/deletion bukan P0; correction dibuat sebagai explicit follow-up/reversal event untuk menjaga history.

### Payments

- `GET /api/payments?from=&to=&page=&limit=`.
- `GET /api/payments/:id`.
- `POST /api/invoices/:id/payments` — P0 atomic payment + single allocation.

Multi-allocation endpoints ditambahkan pada P1 tanpa mengubah P0 contract.

### Reports and audit

- `GET /api/reports/weekly?from=YYYY-MM-DD&to=YYYY-MM-DD` — JSON/HTML model.
- `GET /api/audit-logs?action=&entityType=&from=&to=&page=&limit=` — Owner.

## Transaction boundaries

Satu transaction wajib meliputi:

- import commit: create/match debtors, invoices, opening payments/allocations, row states, job state, audit;
- payment entry: payment, allocation, invariant checks, promise fulfillment, audit;
- dispute resolution dan audit;
- member deactivation dan active-session revocation.

## API acceptance

- Setiap protected endpoint mempunyai unauthenticated dan cross-tenant tests.
- Setiap mutation menghasilkan audit event.
- Derived amounts dapat direkonsiliasi dari allocations.
- Response tidak mengekspos password hash, session/token, raw stack trace, atau data tenant lain.
- OpenAPI atau equivalent machine-readable contract menjadi P1; endpoint inventory ini cukup untuk P0 bila integration tests berfungsi sebagai executable contract.
