# 14-day execution plan

Status: authoritative untuk sequencing, daily exit criteria, critical path, dan cut decisions.

## Execution rules

- P0 dan acceptance criteria dibekukan sebelum coding.
- Setiap hari berakhir dengan runnable, committed state dan updated blocker list.
- Domain rules dibuat sebagai pure functions sebelum dipakai controller/UI.
- Tenant scoping dan audit dibangun bersama setiap write path, bukan ditambahkan belakangan.
- Begitu daily exit criterion gagal, gunakan cut plan; jangan menebus keterlambatan dengan menghapus tests/security.
- Provider/pricing assumptions diverifikasi saat setup dan dicatat di docs.

## Critical path

```text
foundation -> auth/tenancy -> invoice model -> import preview/commit
           -> money/aging -> queue/activity -> payment/report
           -> blocker tests -> deploy/rehearse
```

Import, money correctness, dan tenant isolation menentukan kelayakan. UI polish, exports, messaging helpers, dan PDF bukan critical path.

## Day 1 — scope freeze and skeleton (6–8h)

Tasks:

- Review [Product charter](01-product-charter.md), [Scope](02-scope-and-acceptance.md), dan unresolved decisions.
- Initialize repository/workspaces mengikuti [Engineering and operations](07-engineering-and-operations.md).
- Add root scripts: dev, build, lint, typecheck, test.
- Scaffold API, web, domain package, Prisma, test fixtures, dan docs.
- Implement `GET /health`.
- Draft Prisma identity/tenant models dan three screen wireframes: Login, Dashboard, Invoices.
- Create issue board dari Day 2–14 tasks.
- Shortlist deployment providers dan verifikasi current limits, region, backup, sleep, dan estimated cost.

Exit: clean checkout installs/builds; API health 200; web shell renders; P0 list locked.

Cut if late: skip component library theming/Figma; use text wireframes. Do not cut workspace scripts or scope freeze.

## Day 2 — database, auth, tenancy (6–8h)

- Implement Organization, User, Membership, Session, AuditLog.
- First migration dan seed Owner/Operator across two organizations.
- Login/logout/me with password hashing and secure cookie.
- Auth, role, request-ID, error middleware.
- Tenant-scoped repository pattern.
- Integration tests: valid/invalid login, inactive user, Owner/Operator, cross-org baseline.

Exit: both orgs login; session cannot access known resource shell from another org; audit/login logs safe.

Fallback: members dibuat lewat seed only. Jangan fallback ke hard-coded production user atau localStorage JWT.

## Day 3 — debtor, invoice, domain core (6–8h)

- Implement Debtor, Invoice, Payment, PaymentAllocation schema foundations.
- Pure rules: decimal balance/state and aging.
- Debtor list/create/detail APIs.
- Invoice list/detail APIs with filters/pagination and derived values.
- Basic Invoice/Debtor UI and empty states.
- Tests: aging boundaries, money invariants, tenant reads/writes.

Exit: seeded invoices tampil dengan correct state/aging; cross-org tests lulus.

Cut: manual invoice CRUD; multiple contacts; advanced filters.

## Day 4 — CSV parser and preview (8–10h)

- Implement upload limits, header/parser, normalization, stable error codes.
- Implement InvoiceImportJob/Row and preview service.
- Debtor matching and duplicate-in-file/database checks.
- Build preview UI with summary and row errors/warnings.
- Add all essential CSV fixtures and parser/integration tests.

Exit: mixed file preview deterministic dan membuat zero business records.

Fallback: canonical comma-delimited template only; do not use naive string split yang merusak quoted commas.

## Day 5 — import commit and dashboard (7–9h)

- Atomic, idempotent import commit.
- Create/match debtor, invoice, and opening allocations.
- Audit job/results and safe failure handling.
- Dashboard aggregates and click-through links.
- Import E2E: preview, commit, retry, list.
- Reconcile dashboard totals against fixture expectations.

Exit: valid rows committed once; failure rolls back; dashboard exact.

Cut: chart library. Use metric cards and aging table/bar CSS.

## Day 6 — collection queue (6–8h)

- Implement eligibility, priority score, and tie-breakers in domain package.
- Queue API with server-side pagination/sorting.
- Queue UI and invoice navigation.
- Tests for overdue, due soon, stale contact, broken promise, dispute exclusion.

Exit: seeded expected top order matches test and UI.

Cut: drag reorder, task table, manual priority override, cron generator.

## Day 7 — communication workflow (6–8h)

- Communication model/migration.
- Create activity API and invoice timeline.
- Next-follow-up input/default suggestion.
- Refresh queue behavior after logging.
- Audit and cross-org tests.

Exit: log action persists actor/time/next date and affects queue as expected.

Cut: WhatsApp prefill/templates and editing existing logs.

## Day 8 — promises and disputes (6–8h)

- Promise/Dispute models and lifecycle services.
- Add/cancel promise; add/resolve dispute APIs.
- Invoice UI sections/forms/status labels.
- Derived broken/due/fulfilled behavior with controlled clock.
- Queue/report hooks, audit, tenant tests.

Exit: active/due/broken/fulfilled and open/resolved paths verified; dispute excludes queue.

Cut: configurable categories and advanced resolution workflow; use fixed enums + notes.

## Day 9 — payment allocation (7–9h)

- Atomic P0 payment + single-invoice allocation.
- Over-allocation/concurrency/idempotency protection.
- Partial/full state and promise fulfillment.
- Payment list/detail and invoice entry UI.
- Financial reconciliation and transaction rollback tests.

Exit: partial/full exact, retries safe, no orphan payment, money blocker suite green.

Cut: unallocated payments, multi-invoice allocation, deletion. Never cut exact decimal or transaction tests.

## Day 10 — report and full demo seed (6–8h)

- Weekly report query/model and print stylesheet.
- Complete 15-debtor/~80-invoice seed with activity edge cases.
- Independent seed assertions for counts, allocations, aging, and metrics.
- Add sample CSVs and reset-demo procedure.
- Dry-run first complete demo.

Exit: report reconciles, seed reset repeatable, happy path completes once.

Cut: generated PDF binary/email. Browser print-to-PDF is sufficient.

## Day 11 — integration and E2E hardening (6–8h)

- Complete tenant test matrix for every resource family.
- Complete import/payment transaction and retry cases.
- Playwright core happy path.
- Accessibility/basic narrow viewport sanity.
- Fix all blocker failures before cosmetic bugs.

Exit: blocker suite green locally and in CI; known non-blockers listed.

Cut: broad visual regression and coverage on boilerplate; preserve blocker/E2E happy path.

## Day 12 — security, backup, staging (5–7h)

- Security checklist: cookies, CORS, headers, rate limits, file limits, validation, secret/log review.
- Deploy isolated staging with synthetic data.
- Controlled migration run and smoke tests.
- Create encrypted backup procedure and restore into fresh DB.
- Record restore reconciliation evidence.

Exit: staging passes smoke/tenant checks; restore verified.

Cut: Sentry/advanced alert integration if host logs suffice. Do not cut restore test before client data.

## Day 13 — production and readiness assets (4–6h)

- Production migration/deployment and smoke suite.
- Set production demo/reset boundaries; no real data in public demo.
- Create sample weekly report, one-pager, security summary, known limitations, pilot proposal/checklist.
- Capture screenshots only after production flow stable.

Exit: stable URL, demo credentials via safe channel, required pilot assets ready.

Fallback: provider URL instead of custom domain; plain documents instead of polished PDFs/video.

## Day 14 — acceptance and rehearsal (4–6h)

- Run complete Definition of Done and manual UAT.
- Fix high-severity defects only; freeze new features.
- Re-run CI, production smoke, reconciliation, and critical tenant tests.
- Rehearse 7–12 minute script twice from clean demo reset.
- Finalize known limitations and launch decision.

Exit: all blockers have evidence; demo repeats without DB/manual intervention; pilot boundary clear.

If blocker remains: do not call it production-ready. Use reduced diagnostic demo and disclose missing capability.

## Checkpoints

- **End Day 3:** auth/tenancy/invoice foundation stable.
- **End Day 5:** import + dashboard critical path complete.
- **End Day 9:** operational loop and money path complete.
- **End Day 11:** blocker automation green.
- **End Day 14:** deployed, reconciled, rehearsed.

At each missed checkpoint, remove P1 and apply the next cut tier immediately.

## Cut-scope tiers

### Full P0

Seluruh capabilities di [Scope and acceptance](02-scope-and-acceptance.md).

### Reduced operational MVP

Keep: auth/tenancy, canonical import preview+commit, invoices/aging/dashboard, derived queue, communication, single payment allocation, seed, blocker tests.

Cut/defer: member UI (seed only), dedicated debtor create/edit UI, promise cancellation, dispute resolution UI (admin endpoint permitted), audit UI, advanced filters, report print styling. Promise/dispute capture tetap dipertahankan bila demo membutuhkan.

### Emergency diagnostic demo

Hanya jika tidak ada client data dan seluruh keterbatasan diungkapkan:

- secure single demo organization plus synthetic seed;
- invoice/aging/dashboard and static derived queue;
- communication note capture;
- in-browser static/reconciled report;
- no claim bahwa import/payment/promise/dispute tersedia jika belum bekerja.

Emergency demo bukan pilot-ready product. Tenant and money features yang belum lulus tidak boleh dipakai dengan client data.

## Parallel commercial work

Outreach ringan dapat berjalan selama 14 hari: discovery calls, prospect list, dan pilot document drafting. Jangan mengambil real client data atau menjanjikan outbound automation sebelum prerequisites di [Demo and pilot](09-demo-and-pilot.md) terpenuhi.

## Immediate Day-1 checklist

- [ ] Confirm P0 table and explicit simplifications.
- [ ] Initialize workspace/package lock.
- [ ] Scaffold `apps/api`, `apps/web`, `packages/domain`, `prisma`, `tests`, `scripts`.
- [ ] Add TypeScript, lint, format, typecheck, test, build scripts.
- [ ] Add Express server and `GET /health`.
- [ ] Add Next.js shell and navigation placeholders.
- [ ] Draft Organization/User/Membership/Session schema.
- [ ] Create two-org seed plan.
- [ ] Draw Login, Dashboard, Invoice list wireframes.
- [ ] Create Day 2–14 tickets and checkpoint board.
- [ ] Verify current provider capabilities/costs.
- [ ] Commit runnable skeleton and record Day-1 exit evidence.
