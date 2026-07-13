# Demo and pilot

Status: authoritative untuk demo dataset, rehearsal, sales-readiness, onboarding, dan pilot boundaries.

## Demo organization

Fictional organization: **PT Bumi Makmur Abadi**, distributor bahan bangunan di Surabaya.

Demo date dikontrol oleh `DEMO_TODAY`; baseline fixture memakai `2026-07-13`. Seluruh nama, kontak, invoice, dan pembayaran bersifat synthetic.

### Users

- `demo@bumi.id` — Owner.
- `staff1@bumi.id` — Operator.
- `staff2@bumi.id` — Operator.

Credentials ditetapkan lewat seed environment, tidak ditulis di public repository. Jika ada public demo, data harus resettable dan tidak menerima real client uploads.

### Debtors

15 synthetic debtors:

1. PT Tiga Industri
2. PT Sinar Makmur
3. CV Mega Sentosa
4. UD Maju Jaya
5. PT Cipta Beton
6. PT Alat Berat Mandiri
7. PT Sumber Alam
8. CV Cahaya Renovasi
9. UD Karya Teknik
10. PT Bumi Semesta
11. PT Prima Konstruksi
12. CV Empat Pilar
13. PT Mitra Teguh
14. PT Graha Abadi
15. UD Sukses Jaya

Setiap debtor mempunyai synthetic code `CUST01` dan seterusnya, PIC, phone, dan email dummy.

### Invoice distribution

Sekitar 80 invoices bernilai Rp10 juta–Rp500 juta:

- 20 current/not due;
- 20 overdue 1–7;
- 20 overdue 8–30;
- 10 overdue 31–60;
- 10 overdue lebih dari 60;
- subset paid, partially paid, active/due/broken promise, dan open/resolved dispute.

Fixture examples:

| Debtor | Invoice | Issue / due | Original | Scenario |
| --- | --- | --- | ---: | --- |
| PT Tiga Industri | INV-23001 | 2026-06-10 / 2026-07-10 | Rp150M | Overdue, demo payment target |
| PT Tiga Industri | INV-23015 | 2026-05-01 / 2026-05-31 | Rp200M | Opening allocation Rp120M; Rp80M outstanding |
| PT Sinar Makmur | INV-23002 | 2026-06-05 / 2026-06-20 | Rp75M | Active promise Rp30M on 2026-07-15 |
| PT Sinar Makmur | INV-23016 | 2026-04-01 / 2026-04-30 | Rp300M | Broken promise Rp100M |
| CV Mega Sentosa | INV-23003 | 2026-07-01 / 2026-07-30 | Rp50M | Current |
| UD Maju Jaya | INV-23004 | 2026-06-15 / 2026-07-15 | Rp125M | Due soon |
| PT Cipta Beton | INV-23005 | 2026-05-20 / 2026-06-19 | Rp220M | Fully paid |
| PT Alat Berat Mandiri | INV-23006 | 2026-06-01 / 2026-06-30 | Rp90M | Open Missing POD dispute |

Seed juga membuat communication history dan allocations yang konsisten. Setiap expected dashboard metric dihitung oleh independent fixture assertion, bukan ditulis manual.

## Demo script (7–12 minutes)

1. **Login:** masuk sebagai Owner; jelaskan bahwa workspace dipisahkan per client.
2. **Dashboard:** tunjukkan total AR, overdue, aging, promises, disputes, dan collected amount.
3. **Import preview:** upload mixed sample; tunjukkan valid rows, missing due date, dan duplicate tanpa mengubah data.
4. **Commit:** commit valid rows dan tunjukkan result counts.
5. **Invoice/debtor:** filter overdue, buka debtor dan satu invoice untuk melihat full history.
6. **Collection Queue:** tunjukkan high-value overdue/broken promise di atas dan disputed invoice tidak muncul.
7. **Communication:** log WhatsApp/call result dan next follow-up. Tegaskan pesan dikirim manusia di luar sistem.
8. **Promise:** buat promise future; tunjukkan seeded broken promise lain.
9. **Dispute:** buat Missing POD dispute dan lihat invoice keluar dari normal queue.
10. **Payment:** pada invoice lain, record single allocation; lihat outstanding/dashboard berubah.
11. **Weekly report:** generate summary dan hubungkan angka ke aktivitas tadi.
12. **Close:** tawarkan diagnostic/pilot dengan scope dan success metric jelas.

Jangan mengubah system clock atau database secara manual saat demo. Gunakan seed/reset dan configurable demo date.

## Demo talking points

- “Ini bukan pengganti accounting system; data tetap berasal dari sistem client.”
- “Operator mendapat daftar kerja yang dapat dijelaskan, bukan reminder acak.”
- “Promise dan dispute tidak hilang di personal chat.”
- “Setiap perubahan balance ditelusuri ke allocation.”
- “Tidak ada pesan otomatis atau tindakan legal tanpa manusia.”

## Prospect discovery questions

- Berapa invoice dan customer aktif per bulan?
- Bagaimana aging, promises, disputes, dan payment reconciliation dicatat hari ini?
- Siapa yang bertanggung jawab collection: owner, finance, AR, atau sales?
- Apa sumber keterlambatan terbesar: approval, dokumen, dispute, atau follow-up?
- Accounting/ERP apa yang dipakai dan export apa yang tersedia?
- Siapa yang menyetujui tone/channel komunikasi?
- Outcome apa yang membuat pilot dianggap berhasil?

## Sales-readiness assets

Required before outreach/demo:

- production/controlled demo URL;
- synthetic demo account dan reset procedure;
- canonical sample CSV plus invalid fixture;
- sample print-to-PDF weekly report;
- one-page product/service explainer in Bahasa Indonesia;
- data-security and tenant-isolation summary;
- known limitations/“what we do not do”;
- pilot proposal, service agreement, dan data-processing terms;
- onboarding checklist dan demo script.

Landing page, screenshots/video, branded domain, dan public self-serve demo berguna tetapi tidak boleh menggeser P0 product readiness.

## Pilot prerequisites

- Signed service agreement dan confidentiality terms.
- Written data-processing authorization.
- Named client owner/finance contact.
- Defined invoice/account scope dan pilot period.
- Approved communication channels, sender identity, tone, escalation, dan prohibited language.
- Secure data-transfer path.
- Baseline snapshot dan agreed success metrics.
- Payment verification/reconciliation owner.
- Data retention, export, and deletion plan.
- Incident contact and response expectations.

## Pilot operating flow

1. Sign documents dan set boundaries.
2. Client mengirim latest open-invoice export lewat approved secure channel.
3. Operator previews import dan menyelesaikan data-quality issues bersama client.
4. Client menyetujui baseline totals, customer scope, dan communication plan.
5. Operator menjalankan queue dan mencatat setiap activity.
6. Client tetap menjadi sumber kebenaran untuk bank receipt/accounting confirmation.
7. Weekly sync membahas collected allocations, promises, disputes, dan blockers.
8. Akhir pilot: reconcile results, deliver report/export, decide continuation, lalu delete/retain sesuai agreement.

## Pilot success metrics

Pilih sedikit metric yang dapat diukur dalam dua minggu:

- collected and reconciled amount dari scoped invoices;
- contact coverage terhadap eligible queue;
- promise amount dan fulfillment rate;
- disputes identified/resolved;
- aging data quality issues found;
- operator time untuk membuat weekly report.

Average DSO dapat dicatat sebagai baseline tetapi biasanya tidak cukup sensitif untuk menilai pilot dua minggu.

## Known limitations to disclose

- No outbound automation, legal recovery, client/customer portal, accounting integration, or AI negotiation.
- Import membutuhkan canonical CSV dan human review.
- Payment confirmation tetap bergantung pada client/accounting source.
- Priority score adalah operational heuristic, bukan credit decision.
- P0 reports in-browser/printable; bukan scheduled email/PDF system.
- Initial pilot mempunyai limited scale/support and documented recovery process.
