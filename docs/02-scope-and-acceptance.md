# Scope and acceptance

Status: authoritative untuk prioritas fitur dan Day-14 Definition of Done.

## Scope policy

- **P0:** wajib untuk menjalankan happy path operasional dan demo dengan data seed.
- **P1:** hanya dikerjakan setelah seluruh P0, blocker tests, deployment, dan rehearsal lulus.
- **P2:** dipertimbangkan setelah feedback client nyata.
- **Rejected:** tidak boleh masuk MVP tanpa scope reset eksplisit.

## P0 capabilities

| Capability | Acceptance ringkas | Estimasi awal |
| --- | --- | ---: |
| Login/logout | Valid credentials masuk; invalid ditolak; inactive user kehilangan akses | 3–5 jam |
| Organization, membership, roles | Owner dan Operator tersedia; hanya Owner mengelola member | 4–6 jam |
| Tenant isolation | Semua protected reads/writes scoped ke session organization; cross-org 404 | 3–5 jam |
| Debtor management | List, detail, create/edit; import bisa match/create debtor | 4 jam |
| CSV preview + commit | File tervalidasi per row; valid rows dapat di-commit; invalid rows tidak tersimpan | 10–14 jam |
| Duplicate protection | Unique invoice per org; duplicate dilaporkan dan dilewati | 2–4 jam |
| Aging + invoice views | List/detail/filter menampilkan balance, state, aging, dan relasi yang benar | 6–8 jam |
| Dashboard | Total AR, overdue, aging buckets, broken promises, open disputes cocok dengan data | 3–5 jam |
| Collection queue | Derived queue terurut sesuai formula dan mengecualikan open dispute | 4–6 jam |
| Communication log | Operator dapat mencatat channel, time, notes, dan next follow-up | 3–5 jam |
| Promise-to-pay | Active/due/broken/fulfilled terlihat dan terhitung deterministically | 3–5 jam |
| Dispute tracking | Open/resolved dapat dicatat; open dispute keluar dari normal queue | 3–5 jam |
| Single-invoice payment allocation | Payment mengurangi balance; partial tetap open; over-allocation ditolak | 6–8 jam |
| Weekly summary | In-browser/printable summary untuk period yang dipilih; angka konsisten | 3–5 jam |
| Audit trail | Mutasi penting menyimpan actor, action, entity, time, dan metadata minimum | 3–5 jam |
| Demo seed | Dataset Indonesia mencakup not-due, overdue, partial, paid, promise, dispute | 4–6 jam |

Estimasi adalah alat planning, bukan komitmen. Satu founder dengan 14 hari harus memakai cut plan begitu critical path tertinggal.

## Explicit P0 simplifications

- Owner/user dibuat lewat seed atau admin flow; tidak ada public signup.
- Member dapat ditambahkan tanpa invite email; temporary password disampaikan lewat kanal aman.
- Satu organization aktif per user session.
- CSV memakai canonical template; tidak ada arbitrary column-mapping UI.
- Valid rows di-commit setelah preview; tidak ada inline spreadsheet editor.
- Payment P0 dialokasikan ke satu invoice. Unallocated payment dan multi-invoice allocation adalah P1.
- Weekly report berupa HTML yang print-friendly; PDF binary generation adalah P1.
- Audit log wajib tersimpan, tetapi dedicated audit-log UI boleh ditunda jika dapat diperiksa via admin endpoint.
- Desktop-first, dengan layout dasar tetap usable pada layar kecil; full mobile optimization bukan P0.

## P1 backlog

- Multiple debtor contacts.
- Reminder text drafting dan click-to-WhatsApp.
- Email sending dengan explicit human approval.
- Viewer/Auditor roles dan client read-only portal.
- CSV/PDF exports serta PDF report generation.
- Unallocated payment dan allocation satu payment ke banyak invoice.
- Import rollback UI.
- Editable import mapping dan inline corrections.
- Password reset dan MFA.

## P2 backlog

- Official WhatsApp API.
- OCR/document extraction dan document storage.
- Accounting integrations, dimulai dari provider yang benar-benar dipakai pilot.
- Cash forecasting dan debtor risk scoring setelah data historis cukup.
- Advanced mobile UI, workflow builder, dan client onboarding mandiri.

## Rejected for MVP

- Customer self-service portal.
- Automated legal notices, threats, or demand workflows.
- AI chatbot/negotiator.
- Payment gateway, invoice issuance, tax, lending, or credit decisions.
- Generic workflow builder dan microservices.

## Day-14 Definition of Done

Semua item berikut harus mempunyai bukti. Item bertanda **blocker** tidak dapat diganti dengan known limitation.

| Area | Pass condition | Bukti |
| --- | --- | --- |
| Deployment **blocker** | Production URL membuka login dan health check sukses | URL + smoke-test output |
| Auth **blocker** | Login/logout berhasil; invalid/inactive user ditolak | Integration/E2E test |
| Tenant isolation **blocker** | Org A tidak dapat read/write resource Org B | Automated negative tests |
| Seed | 1 demo org, 2–3 users, 15 debtors, sekitar 80 invoices | Seed summary |
| Import **blocker** | Valid sample imports; bad rows terlihat dan tidak committed | Integration + E2E |
| Money correctness **blocker** | Original, allocation, outstanding, partial, paid, and over-allocation benar | Unit + integration tests |
| Aging | Known dates masuk bucket yang benar | Unit tests dengan injected date |
| Queue | Expected invoices muncul dalam expected order; disputes excluded | Unit/integration test |
| Communication | Add, refresh, dan history tetap tersimpan | E2E |
| Promise | Active/due/broken/fulfilled dapat dibuktikan | Unit + E2E |
| Dispute | Add/resolve mengubah queue behavior | Integration/E2E |
| Report | Period summary cocok dengan source records | Integration + manual reconciliation |
| Audit | Semua P0 mutations menghasilkan audit entry | Integration tests |
| Backup **sebelum client data** | Dump dan restore ke database kosong tervalidasi | Restore log/checksum/counts |
| Demo | Happy path selesai kurang dari 12 menit tanpa manual DB edit | Rehearsal checklist |
| Limitations | Known limitations tertulis dan dibagikan ke pilot owner | Review checklist |

## Change control

Jika P0 ditambah, owner perubahan wajib menjawab:

1. Fitur P0 mana yang dipotong atau waktunya digeser?
2. Business rule dan API contract apa yang berubah?
3. Test baru apa yang menjadi blocker?
4. Apakah demo masih selesai dalam 12 menit?

Tanpa jawaban tersebut, item masuk P1.

## Related references

- Formula dan lifecycle: [Domain rules](03-domain-rules.md)
- Test evidence: [Quality plan](08-quality-plan.md)
- Sequencing dan cuts: [14-day execution plan](10-execution-plan.md)
