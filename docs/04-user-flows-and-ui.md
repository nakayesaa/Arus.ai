# User flows and UI

Status: authoritative untuk alur pengguna dan kebutuhan layar. Business calculations merujuk ke [Domain rules](03-domain-rules.md); dokumen ini tidak mendefinisikan ulang formula.

## Navigation

Desktop-first sidebar:

- Dashboard
- Collection Queue
- Invoices
- Debtors
- Import
- Payments
- Reports
- Settings (Owner only)

Semua list memiliki loading, empty, error, dan pagination state yang konsisten. Currency tampil sebagai Rupiah; dates mengikuti locale Indonesia.

## Flow 1 — login and organization context

1. User memasukkan email dan password.
2. Server memverifikasi password dan membership aktif, lalu membuat secure session.
3. App membuka Dashboard untuk active organization dari session.
4. Invalid credentials menampilkan pesan generik; detail kegagalan hanya masuk security log.
5. Logout menghapus session server-side/cookie dan kembali ke Login.

Success: user tidak pernah memilih atau mengirim `orgId` bebas dari UI.

## Flow 2 — preview and commit invoice CSV

1. Operator membuka Import dan mengunduh canonical template bila perlu.
2. Operator memilih file `.csv` maksimal 5 MB.
3. Sistem membuat import preview dan menampilkan valid/invalid/duplicate row counts.
4. Operator memeriksa row results. Tidak ada invoice yang berubah pada tahap ini.
5. Operator memilih **Commit valid rows** atau membatalkan dan memperbaiki file.
6. Setelah commit berhasil, UI menuju import result atau filtered invoice list.

Whole-file error, missing headers, dan parse failure mencegah commit. Detail kontrak berada di [CSV import contract](06-csv-import-contract.md).

## Flow 3 — daily collection work

1. Operator membuka Collection Queue.
2. Sistem menampilkan eligible invoices terurut menurut priority score.
3. Operator membuka invoice untuk melihat debtor, balance, aging, communication history, promises, disputes, dan allocations.
4. Operator menghubungi customer di luar sistem.
5. Operator mencatat channel, notes, dan next follow-up.
6. Jika customer memberi commitment, operator menambah promise. Jika ada masalah dokumen/amount, operator menambah dispute.
7. Setelah save, queue dan invoice history memperlihatkan state terbaru.

Empty state: “Tidak ada follow-up yang jatuh tempo hari ini.”

## Flow 4 — promise and broken promise

1. Dari invoice detail, operator memasukkan promised amount dan date.
2. UI menampilkan status derived: Active, Due today, Broken, atau Fulfilled.
3. Saat promise due/broken, invoice masuk queue sesuai aturan.
4. Allocation yang memenuhi promised amount mengubahnya menjadi Fulfilled.
5. Cancellation hanya boleh dilakukan dengan reason dan masuk audit.

## Flow 5 — dispute resolution

1. Operator memilih category dan menulis details.
2. Invoice diberi disputed indicator dan keluar dari normal queue.
3. Operator menyelesaikan masalah di luar aplikasi.
4. Operator menekan Resolve dengan resolution note.
5. Jika tidak ada open dispute lain, invoice kembali eligible.

Suggested categories: `MISSING_POD`, `WRONG_AMOUNT`, `WRONG_QUANTITY`, `QUALITY`, `ADMINISTRATIVE`, `OTHER`.

## Flow 6 — record payment

1. Operator membuka invoice dan memilih Record Payment.
2. Operator memasukkan payment date, amount, payer/debtor reference, dan optional bank reference.
3. P0 mengalokasikan amount ke invoice tersebut.
4. Server memvalidasi payer organization, invoice outstanding, dan over-allocation dalam satu transaction.
5. UI memperlihatkan updated outstanding dan invoice state.

Error tidak boleh meninggalkan payment tanpa allocation pada P0. Multi-invoice/unallocated flow ditunda ke P1.

## Flow 7 — weekly report

1. Owner/operator memilih inclusive date range; default tujuh hari terakhir.
2. Sistem menampilkan print-friendly summary.
3. User dapat membuka supporting filtered lists dari metric bila memungkinkan.
4. Report generation dicatat dalam audit.

P0 tidak membutuhkan generated PDF file; browser print-to-PDF cukup.

## Screen specifications

### Login

- Fields: email, password.
- Actions: login.
- States: submitting, invalid credentials, unexpected error.
- Acceptance: success ke Dashboard; session cookie tidak dapat dibaca JavaScript.

### Dashboard

- Cards: total AR, overdue amount/percent, collected in period, broken promises, open disputes.
- Aging breakdown table/bar.
- Click-through ke filtered invoice lists.
- Empty state mengarahkan ke Import.

### Import

- Template download, file picker/dropzone, validation summary, row table, commit/cancel.
- Row table: row number, invoice, debtor, dates, amount, result/error.
- Large preview dapat dipaginasi; tidak perlu spreadsheet editing.

### Invoice list

- Columns: due date, invoice number, debtor, original, outstanding, state, aging, flags.
- Filters: search invoice, debtor, invoice state, aging bucket, disputed.
- Row click membuka detail.

### Invoice detail

- Header: number, debtor, invoice/due dates, original, allocated, outstanding, state, aging/flags.
- Sections: communication timeline, promises, disputes, payment allocations.
- Actions: log communication, add promise, add/resolve dispute, record payment.
- 404 dipakai untuk missing maupun cross-tenant resource.

### Debtor list/detail

- List: name, code, total AR, overdue amount, open invoice count, last activity.
- Detail: debtor identity/contact summary dan invoice list terfilter.
- P0 menyimpan primary phone/email pada debtor; multiple contacts adalah P1.

### Collection Queue

- Columns: invoice, debtor, outstanding, aging, promise/dispute indicator, last contact, next follow-up.
- Sorted server-side; pagination mempertahankan urutan.
- Primary action: open invoice/log action.
- Drag-and-drop dan manual priority override bukan P0.

### Payment entry

- Fields: date, amount, payer reference, bank reference, target invoice.
- Confirmation menampilkan allocation dan remaining invoice balance.
- Amount invalid/over outstanding ditolak dengan pesan spesifik.

### Reports

- Date range, Generate, metric summary, aging table, promises, disputes, and remaining overdue.
- Print stylesheet.
- Empty state untuk period tanpa activity tetap menampilkan point-in-time AR metrics dengan label jelas.

### Settings

- Owner only.
- Organization name, timezone, users, roles, active state.
- Add/deactivate member. Invite email dan self-service onboarding ditunda.

## Reusable UI behavior

- Destructive/resolution actions meminta confirmation.
- Forms mencegah double-submit dan menampilkan field-level validation.
- Success toast tidak menggantikan refreshed server state.
- Tables tetap usable dengan keyboard dan label form terasosiasi.
- Jangan mengandalkan warna saja untuk status; gunakan text/icon.
- Error message menyertakan request ID untuk unexpected server failures.

## Demo happy path

Urutan demo yang lebih rinci dan seed records berada di [Demo and pilot](09-demo-and-pilot.md). UI harus mendukung alur: login → dashboard → import preview → invoice/queue → communication → promise/dispute → payment → report.
