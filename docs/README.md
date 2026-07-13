# Documentation map

Dokumentasi ini memecah `Executive MVP verdict.md` menjadi acuan yang masing-masing memiliki satu tanggung jawab. Tujuannya: keputusan tidak tersebar, overlap berubah menjadi tautan, dan tim tahu dokumen mana yang harus diubah.

## Urutan baca

1. [Product charter](01-product-charter.md) — masalah, positioning, pengguna, dan batas produk.
2. [Scope and acceptance](02-scope-and-acceptance.md) — P0/P1/P2, rejected scope, serta Definition of Done.
3. [Domain rules](03-domain-rules.md) — aturan uang, aging, task, promise, dispute, dan duplicate.
4. [User flows and UI](04-user-flows-and-ui.md) — alur operator dan layar yang harus tersedia.
5. [Data model and API](05-data-model-and-api.md) — kontrak persistence, tenancy, auth, dan endpoint.
6. [CSV import contract](06-csv-import-contract.md) — format file, parsing, validasi, preview, dan commit.
7. [Engineering and operations](07-engineering-and-operations.md) — arsitektur, security, deployment, observability, dan recovery.
8. [Quality plan](08-quality-plan.md) — strategi dan kasus uji.
9. [Demo and pilot](09-demo-and-pilot.md) — seed data, demo, sales assets, dan pilot checklist.
10. [14-day execution plan](10-execution-plan.md) — urutan implementasi, critical path, dan cut plan.
11. [Post-MVP roadmap](11-post-mvp-roadmap.md) — hal yang baru boleh dikerjakan setelah MVP.

## Architectural synthesis

- [System design](system-design.md) — peta end-to-end yang menghubungkan seluruh kontrak authoritative menjadi satu arsitektur, aliran data, boundary, dan jalur evolusi. Dokumen ini derived dan tidak menggantikan pemilik keputusan `01`–`11`.

## Ownership keputusan

| Pertanyaan | Sumber kebenaran |
| --- | --- |
| Apa produknya dan untuk siapa? | `01-product-charter.md` |
| Apa yang masuk MVP? | `02-scope-and-acceptance.md` |
| Bagaimana angka/status dihitung? | `03-domain-rules.md` |
| Bagaimana pengguna menjalankan pekerjaan? | `04-user-flows-and-ui.md` |
| Bagaimana data dan API dikontrak? | `05-data-model-and-api.md` |
| CSV seperti apa yang diterima? | `06-csv-import-contract.md` |
| Bagaimana sistem dibangun dan dioperasikan? | `07-engineering-and-operations.md` |
| Apa bukti fitur benar dan aman? | `08-quality-plan.md` |
| Bagaimana demo dan pilot dijalankan? | `09-demo-and-pilot.md` |
| Apa yang dikerjakan hari ini/berikutnya? | `10-execution-plan.md` |
| Apa yang ditunda? | `11-post-mvp-roadmap.md` |

## Coverage dari dokumen sumber

| Bagian sumber | Dokumen baru |
| --- | --- |
| Executive verdict, Day-14 product definition | `01-product-charter.md` |
| P0/P1/P2/Rejected, Day-14 Definition of Done | `02-scope-and-acceptance.md` |
| Business rules | `03-domain-rules.md` |
| User flows, frontend specification | `04-user-flows-and-ui.md` |
| Database schema, API, auth/multi-tenancy | `05-data-model-and-api.md` |
| CSV-import design | `06-csv-import-contract.md` |
| Project structure, security, infrastructure, CI/CD, logs, backup | `07-engineering-and-operations.md` |
| Testing strategy, detailed test cases | `08-quality-plan.md` |
| Product demo, seed data, sales assets, client pilot | `09-demo-and-pilot.md` |
| 14-day roadmap, cut-scope plan, exact Day-1 tasks | `10-execution-plan.md` |
| Post-MVP roadmap | `11-post-mvp-roadmap.md` |

## Aturan perubahan

- Ubah keputusan hanya di dokumen pemiliknya; dokumen lain menautkan, bukan menyalin.
- Perubahan P0 harus sekaligus memperbarui acceptance criteria, test plan, dan execution plan.
- Formula bisnis hanya boleh didefinisikan di `03-domain-rules.md` dan diimplementasikan sebagai pure functions yang diuji.
- Kontrak API/data hanya boleh didefinisikan di `05-data-model-and-api.md`.
- Provider dan harga infrastruktur wajib diverifikasi saat deployment; jangan mengandalkan klaim lama dari dokumen sumber.
- Tanggal demo bersifat configurable (`DEMO_TODAY`), bukan hard-coded ke 2026-07-13.

## Keputusan yang dinormalisasi dari dokumen sumber

- MVP adalah internal operations tool, bukan public SaaS atau accounting system.
- Signup publik, invite email, password reset, multi-allocation payment, PDF, dan WhatsApp prefill bukan P0.
- Auth memakai server-issued session di secure HTTP-only cookie. `orgId` tidak pernah diterima dari request body/query.
- Invoice unik per organization berdasarkan `invoiceNumber`; debtor tetap digunakan sebagai konteks pencocokan import, bukan bagian dari unique key.
- Aging dihitung dari tanggal; tidak perlu cron yang menulis ulang seluruh invoice setiap hari.
- Collection task bersifat derived query. P0 tidak membutuhkan task table, drag-and-drop, atau background generator.
- Open dispute mengecualikan invoice dari queue normal; broken promise tetap mendapat prioritas tertinggi.
- Payment P0 dialokasikan ke satu invoice pada satu transaksi. Model data tetap memungkinkan satu payment memiliki beberapa allocation setelah MVP.

## Sumber historis

Dokumen asal tetap tersedia di [Executive MVP verdict (historical)](../Executive%20MVP%20verdict.md). Gunakan hanya untuk provenance; jangan menambahkan keputusan baru di sana.
