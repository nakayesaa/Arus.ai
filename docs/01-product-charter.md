# Product charter

Status: authoritative untuk definisi produk, pengguna, positioning, tujuan, dan batas tanggung jawab.

## Executive verdict

AR Collections OS layak dibangun dalam 14 hari oleh satu technical founder hanya jika berfungsi sebagai internal web application untuk operasi collection. Produk membantu operator bekerja lebih konsisten dan memberi owner visibilitas; produk tidak menghilangkan faktor eksternal seperti dispute dokumen, approval customer, atau keterlambatan pembayaran.

Validasi awal ditujukan kepada bisnis B2B kecil–menengah dengan alur invoice sederhana. Produk mendukung managed AR service terlebih dahulu, bukan dijual sebagai standalone SaaS.

## Day-14 product definition

Pada hari ke-14, produk adalah multi-tenant AR collection workspace tempat founder/operator:

- mengimpor dan memvalidasi invoice;
- melihat outstanding dan aging;
- menjalankan queue follow-up yang diprioritaskan;
- mencatat communication, promise-to-pay, dispute, dan payment;
- melihat dashboard dan weekly summary.

Client tetap memakai accounting system mereka. Semua komunikasi eksternal disusun dan dikirim manusia di luar sistem. Produk hanya mencatat hasilnya.

## Positioning

> AR Collections OS adalah internal, multi-tenant AR workflow tool yang dipakai operator untuk mempercepat collection dan memberi owner visibilitas yang jelas, sementara client tetap memakai accounting system mereka.

## Primary users

- **Owner/Founder:** membuat organization, mengelola anggota, melihat audit dan hasil.
- **Operator:** mengimpor data, menjalankan queue, mencatat aktivitas, promise, dispute, payment, dan report.
- **Client owner/finance manager:** menerima hasil/report, tetapi tidak login pada MVP.
- **Debtor/customer:** dihubungi di luar aplikasi; tidak memiliki account atau portal.

## Jobs to be done

1. Saat menerima export AR client, operator ingin memasukkannya dengan aman tanpa double-count.
2. Saat memulai hari, operator ingin tahu invoice mana yang paling penting ditindaklanjuti.
3. Setelah kontak, operator ingin merekam konteks dan next action agar tidak hilang.
4. Saat customer berjanji, dispute, atau membayar, operator ingin status dan balance selalu dapat dijelaskan.
5. Pada akhir minggu, owner ingin melihat collected cash, overdue exposure, promises, disputes, dan pekerjaan tersisa.

## Success indicators

MVP dianggap memberi nilai jika pilot membuktikan bahwa:

- data AR dapat dimuat dan direkonsiliasi tanpa spreadsheet bayangan;
- operator dapat menjalankan daily collection queue;
- setiap outstanding balance dapat ditelusuri ke invoice dan allocations;
- promise/dispute tidak lagi hilang di chat pribadi;
- weekly report dapat dibuat dari data operasional yang sama.

Outcome bisnis pilot ditetapkan per client, misalnya nominal terkumpul, jumlah promise fulfilled, atau penurunan invoice overdue tertentu. Jangan menjanjikan penurunan DSO dalam pilot dua minggu tanpa baseline yang memadai.

## Product boundaries

Produk ini:

- bukan ERP, general ledger, invoicing, tax, payment gateway, atau lending product;
- bukan debt collection agency atau legal enforcement system;
- tidak mengirim WhatsApp/email/demand letter otomatis;
- tidak memakai AI untuk negosiasi atau keputusan collection;
- tidak menggantikan approval dan reconciliation manusia;
- tidak menyimpan dokumen besar atau membangun document management system pada MVP.

## Operating principles

- Human review untuk tindakan sensitif.
- Deterministic, explainable rules; tanpa machine learning di MVP.
- Client data terisolasi per organization.
- Correctness of money dan tenant isolation lebih penting daripada visual polish.
- Scope baru tidak masuk build sampai seluruh P0 dan blocker tests lulus.

## Related references

- Batas implementasi: [Scope and acceptance](02-scope-and-acceptance.md)
- Aturan perhitungan: [Domain rules](03-domain-rules.md)
- Narasi demo dan pilot: [Demo and pilot](09-demo-and-pilot.md)
