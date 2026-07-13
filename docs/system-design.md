# System design

Status: derived architectural blueprint. Dokumen ini menjelaskan bagaimana seluruh kontrak produk bekerja sebagai satu sistem. Dokumen ini tidak menggantikan sumber keputusan authoritative di `01`–`11`; jika ada konflik, dokumen pemilik keputusan yang berlaku.

## Purpose

AR Collections OS adalah internal, multi-tenant operations system untuk managed AR collection. Sistem menerima data invoice dari accounting system client, membantu operator menentukan pekerjaan collection berikutnya, merekam hasil tindakan manusia, menjaga payment allocation dapat direkonsiliasi, dan menghasilkan visibility dari data operasional yang sama.

Sistem sengaja bukan accounting system baru dan bukan automated debt collector. Client accounting system tetap memegang accounting truth; AR Collections OS memegang operational collection truth.

Keberhasilan arsitektur berarti:

- setiap outstanding balance dapat dijelaskan dari invoice dan allocation;
- import tidak menggandakan atau mengubah data secara diam-diam;
- setiap invoice penting memiliki state dan next action yang dapat dijelaskan;
- promise, dispute, communication, dan payment tidak hilang di kanal pribadi;
- report dapat direkonsiliasi ke source records;
- request satu organization tidak dapat membaca atau mengubah organization lain;
- sensitive external action tetap berada di bawah keputusan manusia.

## Decision ownership

System design hanya menyatukan keputusan berikut; perubahan tetap dilakukan di dokumen pemiliknya.

| Concern | Authoritative document |
| --- | --- |
| Product, users, positioning, boundaries | [Product charter](01-product-charter.md) |
| MVP priority and Definition of Done | [Scope and acceptance](02-scope-and-acceptance.md) |
| Money, date, lifecycle, queue, and metric formulas | [Domain rules](03-domain-rules.md) |
| Operator flows and screen behavior | [User flows and UI](04-user-flows-and-ui.md) |
| Persistence, auth, tenancy, transactions, and HTTP contract | [Data model and API](05-data-model-and-api.md) |
| File parsing, preview, and import commit | [CSV import contract](06-csv-import-contract.md) |
| Repository structure, security, deployment, and recovery | [Engineering and operations](07-engineering-and-operations.md) |
| Verification and release blockers | [Quality plan](08-quality-plan.md) |
| Deferred automation and product evolution | [Post-MVP roadmap](11-post-mvp-roadmap.md) |

## Architectural verdict

Build a layered modular monolith:

- one Next.js web application;
- one Express TypeScript API;
- one PostgreSQL database accessed through Prisma;
- one pure TypeScript domain package;
- synchronous request/transaction workflows for P0;
- no worker, message broker, microservice, or separate analytics store for P0.

This shape minimizes operational surface area while preserving clear module seams for later integrations and approved automation.

## System context

```text
                         ┌─────────────────────────┐
                         │ Client accounting system│
                         │ accounting source truth │
                         └────────────┬────────────┘
                                      │ canonical CSV export
                                      ▼
┌───────────────┐           ┌───────────────────────┐
│ Owner/Operator│──────────▶│   AR Collections OS   │
│ authenticated │ browser   │ operational truth     │
└───────┬───────┘◀──────────│ queue, history, report│
        │                    └───────────┬───────────┘
        │ human communication            │ report shared by human
        ▼                                ▼
┌───────────────────────┐      ┌──────────────────────┐
│ WhatsApp/email/phone  │      │ Client owner/finance │
│ outside the application│      │ no MVP login         │
└───────────┬───────────┘      └──────────────────────┘
            ▼
     ┌──────────────┐
     │ Debtor/customer│
     │ no account    │
     └──────────────┘
```

### Authority boundaries

| Information or action | System responsible |
| --- | --- |
| Posted invoice and official accounting records | Client accounting system |
| Imported receivable working set | AR Collections OS |
| Collection priority and next action | AR Collections OS, derived deterministically |
| Communication delivery | Human using an external channel |
| Communication outcome and notes | AR Collections OS |
| Promise and dispute operational history | AR Collections OS |
| Recorded payment and allocation used by the workspace | AR Collections OS, entered and reconciled by an operator |
| Client-facing weekly result | AR Collections OS data, reviewed/shared by a human |

AR Collections OS must not imply that an operational record has posted to the client ledger. Future accounting integration requires explicit sync and reconciliation states rather than silently changing this boundary.

## Core operating loops

The product consists of two connected loops over one set of tenant-scoped source records.

```text
FINANCIAL TRUTH LOOP
CSV → preview → validate → commit → invoice → payment/allocation → reconciliation
                                      │
                                      ▼
COLLECTION ACTION LOOP
derived queue → human contact → communication/promise/dispute → next follow-up
                                      │
                                      ▼
VISIBILITY LOOP
dashboard → supporting lists → weekly report → owner review
```

The visibility loop never owns independent totals. It reads the same invoices, allocations, promises, disputes, and communications used by daily operations.

## Runtime topology

```text
Browser
  │ HTTPS + secure session cookie
  ▼
Next.js web
  │ typed JSON/multipart requests
  ▼
Express API
  ├── authentication and tenant context
  ├── schema validation and capability checks
  ├── application services and transactions
  ├── pure domain calculations
  ├── audit and structured application logs
  └── Prisma repositories
          │ TLS connection
          ▼
     PostgreSQL

Operational side channels:
CI/CD → build, test, migration, deploy, smoke
Monitoring → health, logs, latency, errors, database metrics
Backup → provider backup + encrypted logical dump → isolated restore test
```

Web and API may deploy to different hosts, but they require stable configured origins. Only the API accesses PostgreSQL. There is no direct frontend-to-database path.

## Module boundaries

Modules are logical ownership boundaries inside the API, not separate services.

### Identity and tenancy

Owns organization, user, membership, session, role, and active-organization context.

Responsibilities:

- authenticate active users and memberships;
- issue, revoke, and expire server-side sessions;
- create a trusted request context containing actor, organization, and role;
- enforce Owner versus Operator capabilities;
- return `404` for missing and cross-tenant business resources.

It does not own collection or financial rules.

### Import and reconciliation

Owns invoice import jobs, normalized row results, validation outcomes, commit status, and traceability to created records.

Responsibilities:

- accept only the canonical bounded CSV format;
- parse and normalize exact dates and money;
- match or propose debtor creation deterministically;
- detect duplicate invoices within the file and organization;
- keep preview free of production debtor/invoice/payment mutations;
- commit all valid rows atomically;
- create traceable opening payments/allocations for prior paid amounts;
- expose a reconciliation summary after commit.

Raw files do not need permanent storage. Filename, hash, normalized safe row payload, warnings, errors, and target IDs provide the required traceability.

### Receivables

Owns debtors and invoices as the operational representation of client receivables.

Responsibilities:

- debtor identity and primary contact context;
- immutable invoice identity within an organization;
- original amount and contractual dates;
- invoice list/detail queries;
- derived outstanding, invoice state, aging, and flags.

Receivables never directly writes an outstanding balance. Balance is derived from the invoice and valid non-reversed allocations.

### Collection workflow

Owns communication history, promises, disputes, explicit next follow-up dates, and the derived queue.

Responsibilities:

- record what the human operator did outside the system;
- preserve actor, time, channel, notes, and next follow-up;
- derive promise status from dates and allocations;
- exclude open disputes from the normal collection queue;
- compute deterministic eligibility, priority score, reason components, and tie-breakers;
- return stable server-side pagination order.

P0 has no persisted task table. The queue is a query over current source records and pure domain functions.

### Payments and allocations

Owns payment headers, allocation records, allocation reversals, and payment-side reconciliation.

Responsibilities:

- create a P0 payment and its single invoice allocation atomically;
- reject zero, negative, duplicate, or excessive allocation;
- prevent concurrent writes from over-allocating an invoice;
- expose allocation history used to derive balance and promise fulfillment;
- preserve corrections through reversal/correction records instead of silent deletion.

The one-to-many Payment-to-Allocation model remains in place even though the P0 user flow creates exactly one allocation.

### Reporting

Owns read orchestration for dashboard and weekly report models.

Responsibilities:

- calculate point-in-time AR and aging using an explicit `asOfDate`;
- calculate period collection from allocation dates;
- expose supporting filtered lists where practical;
- keep period metrics distinct from point-in-time metrics;
- produce print-friendly HTML/model output;
- audit report generation.

Reporting does not persist a competing balance or analytics ledger in P0.

### Audit and operations

Audit owns immutable business evidence. Application logging owns runtime diagnosis. They are separate concerns.

Audit entries record safe actor/action/entity/request metadata for important business mutations. Logs record request and system behavior. Neither may contain credentials, session tokens, raw authorization headers, bank secrets, or full CSV rows.

## Persistence model

### Source records versus derived values

| Persisted source records | Derived at read/workflow time |
| --- | --- |
| Organization, membership, session | Capability from active role/context |
| Debtor and invoice facts | Outstanding and invoice state |
| Payment and allocation/reversal | Allocated total |
| Communication and explicit next follow-up | Days since last contact |
| Promise amount/date and final events | Active, due, broken, fulfilled status |
| Dispute open/resolution events | Queue exclusion flag |
| Import job and row outcomes | Reconciliation totals |
| Audit event | Dashboard/report presentation |
| — | Aging bucket and priority score |

Derived values may later be cached for measured performance reasons, but the source records remain authoritative and the cache must be rebuildable and reconcilable.

### Data conventions

- Every tenant-owned record carries `organizationId` and tenant-leading indexes.
- Invoice uniqueness is organization-scoped and case-insensitive after documented normalization.
- Money uses exact decimal storage or integer minor units; the API transports decimal strings.
- Business dates use `YYYY-MM-DD`; event timestamps use UTC ISO 8601.
- Calendar calculations use the organization timezone and injected `asOfDate`.
- Soft deletion may hide debtor/invoice records, but financial activity uses explicit reversal/correction.
- Child-to-parent writes verify that every referenced entity belongs to the active organization.

Exact fields, relationships, constraints, and indexes remain owned by [Data model and API](05-data-model-and-api.md).

## Dependency rules

```text
Web UI ───────────────▶ API client ───────────────▶ HTTP API
Controller/routes ───▶ Application service ──────▶ Repository
                              │                       │
                              ▼                       ▼
                         Domain package             Prisma
                              │                       │
                              └── pure values         ▼
                                                  PostgreSQL
```

Rules:

- controllers parse HTTP, hand off capability checks, and map responses;
- services orchestrate workflows and own transaction boundaries;
- repositories perform tenant-scoped persistence and receive only trusted tenant context;
- the domain package contains pure money/date/aging/promise/queue/metric logic;
- the web API client transports typed data but contains no business formulas;
- domain code imports no Express, Prisma, Next.js, process environment, or wall clock;
- modules interact through explicit service/query interfaces rather than reaching into another module's repository.

## Code scaffold

The repository follows the structure in [Engineering and operations](07-engineering-and-operations.md):

```text
/
├── README.md
├── docs/
├── package.json
├── tsconfig.base.json
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── controllers/
│   │       ├── services/
│   │       ├── repositories/
│   │       ├── middleware/
│   │       ├── routes/
│   │       └── server.ts
│   └── web/
│       ├── app/
│       ├── components/
│       └── lib/api-client/
├── packages/
│   └── domain/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── fixtures/
│   └── e2e/
└── scripts/
    ├── backup.sh
    └── smoke-test.ts
```

Within each layer, filenames should retain the logical module boundary, for example `imports.controller.ts`, `imports.service.ts`, and `imports.repository.ts`. Shared infrastructure stays narrow: configuration, database client, errors, authentication, tenant context, logging, and validation.

Do not create a generic base repository or workflow framework before repeated use proves a stable abstraction.

## Request security and tenant flow

Every protected request follows one path:

```text
Request
  → request ID
  → session lookup and revocation/expiry check
  → active user and membership check
  → trusted organization/role context
  → route capability check
  → params/body/query validation
  → tenant-scoped service and repository
  → transaction plus audit when mutating
  → safe response/error with request ID
```

Security invariants:

- `organizationId` from body, query, or arbitrary client input is ignored or rejected;
- all protected repository methods require trusted organization context;
- cross-tenant IDs resolve as `404` without identifying data;
- login uses generic invalid-credential responses and rate limiting;
- production cookies are secure, HTTP-only, and use the documented same-site policy;
- configured CORS origin is explicit rather than wildcard;
- inactive users or memberships lose access on their next request;
- client-rendered notes and imported strings are treated as untrusted text;
- file type, byte size, row count, field lengths, and schemas are bounded.

The automated tenant-isolation suite is mandatory before real client data.

## Primary execution flows

### Login

```text
Credentials → rate limit → user/password verification → active membership
→ session creation → secure cookie → dashboard for session organization
```

Logout revokes the server session. Member deactivation and session revocation share one transaction where required.

### CSV preview and commit

```text
Upload
  → file contract checks
  → stream/parse rows
  → normalize and validate
  → debtor matching and duplicate detection
  → persist preview job/row outcomes
  → operator review
  → idempotent commit transaction
       ├── match/create debtors
       ├── create invoices
       ├── create opening payment/allocation when needed
       ├── mark committed rows/job
       └── write audit event
  → reconciliation summary
```

Failure during commit rolls back every business write in that commit. Invalid and duplicate rows remain visible but are not committed.

### Daily collection

```text
Queue request with asOfDate
  → tenant invoices with positive outstanding
  → derive state, aging, promise status, dispute flag, last contact
  → apply eligibility
  → compute deterministic score and tie-breakers
  → paginate server-side
  → operator contacts customer outside AR OS
  → record communication/promise/dispute and explicit next follow-up
  → refresh from server-derived state
```

The system recommends and records; it does not negotiate or send automatically in P0.

### Payment entry

```text
Payment command + idempotency protection
  → tenant/capability validation
  → load target invoice and current allocations
  → validate exact amount and remaining balance
  → begin transaction with appropriate concurrency protection
  → create payment + allocation
  → determine promise fulfillment from allocations
  → write audit events
  → commit
  → return recalculated invoice state/outstanding
```

No orphan payment remains if allocation or audit persistence fails.

### Dashboard and weekly report

```text
Date/asOfDate validation
  → tenant-scoped source queries
  → pure metric aggregation
  → reconciliation-safe response model
  → supporting filtered links
  → print-friendly presentation
  → report audit event
```

The UI labels period activity and point-in-time balances distinctly.

## Consistency, retry, and concurrency

### Transaction boundaries

The API service layer owns the mandatory atomic workflows defined in [Data model and API](05-data-model-and-api.md):

- import commit;
- payment creation and allocation;
- dispute resolution;
- member deactivation and active-session revocation.

Audit writes for those mutations occur inside the same business transaction where specified. A successful business response must never describe a partially completed workflow.

### Idempotency

- Import commit can transition a ready job to committed only once.
- Retrying a committed job returns the prior result rather than creating new invoices.
- Payment mutation uses `Idempotency-Key` or an equivalent unique operation key.
- UI double-submit prevention is helpful but never replaces server idempotency.
- Conflicting reuse of one idempotency key with a different payload is rejected.

### Concurrent money writes

Payment allocation re-reads and protects the relevant payment/invoice state inside the transaction. Two concurrent commands may not both consume the same remaining outstanding. The integration suite proves this invariant against real PostgreSQL.

## Observability and audit

Every request receives or propagates a request ID, which is returned as `X-Request-ID` and included in safe unexpected-error responses.

Structured application logs contain timestamp, level, service, environment, request ID, route template, status, duration, and safe actor/organization identifiers. They answer whether the application operated correctly.

Audit events contain business actor, action, entity, timestamp, request ID, and safe metadata. They answer who changed business state and when.

Minimum signals:

- liveness/readiness health;
- request error rate and latency;
- repeated `5xx`;
- database connectivity/storage;
- failed import transactions;
- optional exception tracking.

No financial amount should be silently repaired from logs. Corrections happen through controlled data workflows and remain auditable.

## Deployment and recovery

One release consists of immutable web and API builds plus a known migration identifier.

```text
clean checkout → npm ci → lint/format → typecheck → unit
→ disposable-PostgreSQL integration → build → optional E2E preview
→ controlled migration → deploy → production smoke
```

Deployment requirements:

- HTTPS and stable origins;
- web host compatible with Next.js;
- API host compatible with the Express runtime;
- managed PostgreSQL with TLS, restricted credentials, metrics, and backup/export path;
- production database in an appropriate region close to the application and pilot operation;
- secrets only in deployment secret stores;
- migrations run once as a controlled release step.

Recovery is not accepted merely because a backup file exists. Before real client data, restore into an isolated database and reconcile entity counts plus sampled invoice/allocation balances. Code rollback and database recovery remain separate decisions.

Provider, cost, region, sleep behavior, retention, and restore entitlement are deployment-time decisions and must be verified against current provider facts.

## Verification architecture

Testing follows business risk rather than a coverage vanity metric.

### Pure domain tests

Exercise every branch and boundary for exact money, dates, aging, invoice state, promise lifecycle, queue eligibility/priority, report aggregation, and CSV normalization. All calendar-sensitive functions receive an injected date.

### PostgreSQL integration tests

Exercise sessions, roles, tenant boundaries, preview/commit, rollback, retries, concurrent allocation, promise fulfillment, dispute/queue interaction, report reconciliation, and audit creation through the real API and disposable database.

### End-to-end tests

Exercise the operator path from login through import, queue action, promise/dispute, payment, and weekly report using deterministic seed/reset data.

### Operational tests

Exercise clean setup, migrations, production smoke, backup restore, secret absence, logs, and health visibility.

No production release with real client data proceeds while a tenant, authentication, import, or money blocker test fails.

## Evolution toward automation

Automation is an evolution of trusted workflows, not a separate product core.

### P0: trustworthy manual operations

- canonical CSV import with human preview;
- deterministic collection queue;
- human communication outside the system;
- manual recording of outcomes, promises, disputes, and payments;
- dashboard and printable report;
- tenant isolation, audit, backup, and reconciliation.

### P1: reduce repeated operator work

Possible capabilities after pilot evidence:

- reminder drafting and click-to-WhatsApp with human review;
- outbound email with preview, consent, rate limits, and audit;
- scheduled internal reports;
- first real accounting integration;
- richer contacts and dispute ownership;
- unallocated payments and multiple allocations;
- client read-only access if repeatedly requested.

Architecture seams:

- accounting adapters feed the same canonical import/reconciliation boundary;
- approved outbound messages use explicit draft, approved, sent, and failed states;
- external side effects use a transactional outbox before delivery is automated;
- scheduled work introduces a worker/job runner only when a real asynchronous use case exists;
- automated retries use idempotency and never repeat a money mutation or message blindly;
- every automatic decision exposes its rule, input, outcome, and human override where appropriate.

### Later: conditional intelligence and integrations

Official WhatsApp, OCR, forecasting, and risk scoring require proven demand, sufficient clean data, security/compliance review, and measurable benefit. AI may help draft or summarize, but it must not autonomously negotiate, threaten, make credit decisions, or rewrite financial truth.

## Explicitly excluded architectural components

Do not add these to the MVP scaffold:

- microservices or service mesh;
- message broker or general-purpose workflow engine;
- persisted daily task generation;
- separate reporting warehouse;
- document management system;
- public signup or debtor/client portal;
- automatic email/WhatsApp sending;
- AI negotiation or collection decisioning;
- arbitrary CSV mapping UI;
- generic repository/framework abstractions;
- mutable stored balance as financial source of truth.

## Build sequence

The dependency-safe order is:

1. Repository workspace, configuration validation, database connection, request IDs, safe errors, and health.
2. Organization, users, memberships, sessions, capabilities, and tenant-scoped repository pattern.
3. Exact domain primitives for money, business dates, balance, aging, and deterministic clock injection.
4. Debtor/invoice persistence plus canonical CSV preview and atomic commit.
5. Invoice views, dashboard, and reconciliation queries.
6. Communication, promise, dispute, and derived collection queue.
7. Atomic payment/allocation and promise fulfillment.
8. Weekly report and audit access.
9. Tenant/money/import blocker suite, E2E happy path, security baseline, deployment, restore test, and rehearsal.

Visual polish and P1 work cannot move ahead of correctness and tenant-isolation gates.

## Architecture acceptance checklist

The grand system design is implemented correctly when:

- [ ] web has no direct database access or duplicated business formulas;
- [ ] every protected request derives tenant context from an active session;
- [ ] every tenant repository method and index is organization-scoped;
- [ ] preview causes no production receivable/payment mutation;
- [ ] import commit is atomic and idempotent;
- [ ] outstanding reconciles exactly to invoice amount minus non-reversed allocations;
- [ ] aging, promise state, queue, and reports use injected business dates;
- [ ] the queue is derived, deterministic, explainable, and excludes open disputes;
- [ ] payment and allocation cannot separate or over-allocate under retry/concurrency;
- [ ] every P0 mutation creates the required audit evidence;
- [ ] logs and errors expose no secrets or raw client files;
- [ ] clean setup, migration, smoke, backup, and isolated restore are proven;
- [ ] no outbound communication occurs without the product phase's required human approval;
- [ ] all blocker tests in [Quality plan](08-quality-plan.md) pass.

## Decisions intentionally left open

The following are not foundation assumptions and must be decided from pilot evidence or verified provider facts:

- deployment provider and exact recurring cost;
- production region, backup retention, RPO, and RTO agreement;
- first accounting provider and synchronization semantics;
- background-job technology;
- email/WhatsApp provider, consent, and template policy;
- client portal authentication and authorization model;
- need for cached read models or database row-level security beyond the tested P0 controls;
- document storage, OCR, forecasting, and risk-scoring architecture.

Leaving these open prevents hypothetical scale from weakening the Day-14 product.
