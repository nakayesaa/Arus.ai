# Quality plan

Status: authoritative untuk verification strategy, blocker suite, test cases, dan manual acceptance.

## Quality priorities

Urutan risiko:

1. Tenant data leak.
2. Salah hitung uang atau double write.
3. Import merusak/menggandakan data.
4. Aging, promise, dispute, dan queue salah.
5. Happy path tidak dapat dijalankan.
6. Styling dan convenience issues.

Coverage percentage bukan tujuan utama. Target 100% branch coverage untuk pure financial/tenant-critical rules dan meaningful integration coverage untuk workflows.

## Test layers

### Unit tests

Pure functions dengan injected `asOfDate`:

- exact decimal parsing/arithmetic;
- outstanding and invoice state;
- aging boundaries dan leap/calendar cases;
- promise lifecycle/fulfillment;
- dispute/queue eligibility;
- priority score dan tie-breakers;
- dashboard/report aggregates;
- CSV date/Rupiah normalization;
- debtor matching dan duplicate detection.

### Integration tests

Real API + disposable PostgreSQL:

- login/logout/session revocation;
- role capabilities;
- tenant-scoped reads dan writes untuk setiap resource family;
- preview vs commit import lifecycle;
- transaction rollback pada partial failure;
- idempotent import commit/payment retry;
- payment + allocation + promise fulfillment;
- dispute resolution dan queue return;
- report reconciliation;
- audit entry pada setiap P0 mutation.

### End-to-end tests

Playwright minimal:

1. Login dan dashboard.
2. Upload invalid/valid mixed CSV, review, commit valid rows.
3. Buka queue/invoice dan log communication.
4. Add promise dan lihat derived status dengan controlled date.
5. Add/resolve dispute dan verifikasi queue behavior.
6. Record partial/full payment dan lihat balance/state.
7. Generate weekly report.

E2E memakai seed/reset yang deterministic dan tidak bergantung pada production.

### Security and data-quality tests

- unauthenticated, invalid, expired, revoked, dan inactive sessions;
- Org A mencoba list/get/create/update child resource milik Org B;
- user mengirim forged `organizationId` di body/query;
- disallowed file type, oversized file, excessive rows, malformed CSV;
- stored/reflected XSS-like content ditampilkan sebagai text;
- duplicate email/invoice and conflicting retries;
- negative/zero/over-allocation and concurrent allocations;
- generic server errors tanpa stack/secrets.

## Blocker test matrix

| ID | Scenario | Expected |
| --- | --- | --- |
| SEC-01 | Org A GET invoice ID Org B | 404; no identifying data |
| SEC-02 | Org A posts activity to invoice Org B | 404; no row/audit business event created |
| SEC-03 | Body berisi `organizationId` Org B | Ignored/rejected; record scoped to session org |
| SEC-04 | Deactivated member reuses session | 401; session revoked/rejected |
| AUTH-01 | Valid/invalid login | Session created only for valid active membership |
| IMP-01 | Preview mixed file | No production debtor/invoice/payment changes |
| IMP-02 | Commit valid rows | Only valid rows committed once; job/audit consistent |
| IMP-03 | Retry same commit | No duplicate records or allocations |
| IMP-04 | Commit transaction failure | Zero partial business writes |
| MONEY-01 | Partial payment | Outstanding reduced exactly; state `PARTIALLY_PAID` |
| MONEY-02 | Full payment | Outstanding zero; state `PAID`; removed from queue |
| MONEY-03 | Over-allocation | 422; payment/invoice unchanged |
| MONEY-04 | Two concurrent allocations | At most remaining balance committed |
| REPORT-01 | Seed reconciliation | Dashboard/report totals equal independent allocation sums |

Semua SEC, AUTH, IMP, dan MONEY cases adalah release blockers.

## Domain boundary cases

Assume `asOfDate = 2026-07-13`:

| Due date | Expected |
| --- | --- |
| 2026-07-20 | `CURRENT` + `DUE_SOON` |
| 2026-07-13 | `CURRENT` + `DUE_TODAY` |
| 2026-07-12 | `OVERDUE_1_7`, 1 day overdue |
| 2026-07-06 | `OVERDUE_1_7`, 7 days overdue |
| 2026-07-05 | `OVERDUE_8_30`, 8 days overdue |
| 2026-06-13 | `OVERDUE_8_30`, 30 days overdue |
| 2026-06-12 | `OVERDUE_31_60`, 31 days overdue |

Tambahkan batas 60/61, 90/91, month/year rollover, leap day, dan organization timezone.

## Detailed workflow cases

### Duplicate invoice import

- Precondition: organization memiliki `INV-001`.
- Action: preview file dengan `inv-001` setelah normalization.
- Expected: `DUPLICATE_IN_DATABASE`; existing invoice tidak berubah.

### Duplicate inside one file

- Action: dua rows memakai normalized invoice number sama.
- Expected: satu deterministic winner atau keduanya invalid sesuai implementation decision; P0 memilih first valid row dan menandai row berikutnya `DUPLICATE_IN_FILE`.

### Opening partial payment

- Input: original 1,000; paid 600; outstanding 400.
- Expected: invoice 1,000 + traceable opening payment/allocation 600; derived outstanding 400; `PARTIALLY_PAID`.

### Broken promise

- Precondition: promise 500,000 due 2026-07-10; no post-promise allocations.
- As of 2026-07-13: `BROKEN` dan invoice mendapat queue bonus.

### Promise fulfillment by partial invoice payment

- Promise 300,000 on invoice outstanding 500,000.
- Post-promise allocation 300,000.
- Expected: promise `FULFILLED`; invoice remains `PARTIALLY_PAID` with 200,000 outstanding.

### Dispute blocks queue

- Overdue invoice has open dispute.
- Expected: absent from normal queue, present in AR/aging/open-dispute metrics.
- Resolve dispute: invoice returns to queue if otherwise eligible.

### Payment transaction failure

- Force audit/allocation write failure after payment insert attempt.
- Expected: entire transaction rolled back; no orphan payment.

### Ambiguous debtor

- Legacy data contains normalized-name collision and import lacks customer code.
- Expected: `AMBIGUOUS_DEBTOR`; no new debtor guessed.

### Unsupported outbound messaging

- No send email/WhatsApp API or active button exists in P0.
- Copy/prefill controls, if accidentally exposed, must be feature-flagged off.

## Manual UAT

| Test | Steps | Expected | Blocker |
| --- | --- | --- | --- |
| Login | Valid login, logout, invalid login | Correct navigation/session behavior | Yes |
| Empty org | Login before invoices | Useful dashboard/import empty state | No |
| Import | Preview mixed fixture, commit | Counts/errors/data correct | Yes |
| Aging | Inspect known seed invoices | Buckets and flags match fixture | Yes |
| Queue | Compare top records to expected score | Order/exclusions correct | Yes |
| Communication | Add, refresh | Timeline persists with actor/time | Yes |
| Promise | Add past/future promise under demo date | Status correct | Yes |
| Dispute | Add then resolve | Queue behavior changes | Yes |
| Payment | Partial then full on suitable invoices | Exact balances/states | Yes |
| Report | Generate period summary | Totals reconcile | Yes |
| Role | Operator opens Settings/Audit | Access denied | Yes |
| Cross-org | Attempt known foreign resource | 404 | Yes |
| Mobile sanity | Run core read/action on narrow viewport | Usable, no critical controls hidden | No |

## Test data and clock

- Domain tests selalu inject `asOfDate`.
- API/E2E memakai test-only clock injection atau seeded organization demo date.
- Production client organizations tidak boleh menerima user-controlled `asOfDate` untuk mutations.
- Every test run creates isolated organization IDs or resets disposable DB.
- Passwords pada demo/test tidak pernah dipakai di production client account.

## Release evidence

Simpan untuk setiap release candidate:

- CI commit/status;
- migration identifier;
- blocker test output;
- seed counts dan financial reconciliation result;
- production smoke result;
- backup/restore evidence jika menyentuh client data;
- manual UAT checklist dan known limitations.

Definition of Done lengkap berada di [Scope and acceptance](02-scope-and-acceptance.md).
