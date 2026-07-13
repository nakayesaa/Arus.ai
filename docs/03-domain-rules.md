# Domain rules

Status: authoritative untuk seluruh perhitungan dan lifecycle domain. Kode, UI, API, report, dan test harus mengikuti dokumen ini.

## Shared conventions

- Semua tanggal bisnis diproses sebagai calendar date pada timezone organization; default pilot: `Asia/Jakarta`.
- Function domain menerima `asOfDate`; test dan demo tidak membaca wall clock secara langsung.
- Money disimpan sebagai `Decimal(18,2)` atau integer minor unit. Jangan memakai JavaScript floating point untuk aritmetika uang.
- `invoiceState`, `agingBucket`, dan workflow flags adalah konsep berbeda.
- Derived value dihitung dari source records. Jika disimpan untuk performa, source records tetap sumber kebenaran dan harus dapat direkonsiliasi.

## Invoice identity

Invoice unik dalam satu organization berdasarkan:

```text
(organizationId, normalizedInvoiceNumber)
```

`normalizedInvoiceNumber` adalah invoice number yang sudah di-trim; pencarian duplicate case-insensitive. Debtor dipakai untuk membantu import matching dan pesan error, tetapi bukan bagian unique key. Ini mencegah dua debtor dalam satu client memakai invoice number yang sama tanpa terdeteksi.

MVP tidak meng-update duplicate secara otomatis. Row dilewati dan dilaporkan sebagai duplicate.

## Outstanding balance and invoice state

```text
allocated = sum(nonReversedPaymentAllocations.amount)
outstanding = originalAmount - allocated
```

Constraints:

- `originalAmount > 0`.
- Allocation harus `> 0`.
- Total allocation ke invoice tidak boleh melebihi outstanding sebelum transaksi.
- Total allocation dari payment tidak boleh melebihi unallocated payment amount.
- Validasi dan write allocation dilakukan dalam satu database transaction.
- Outstanding tidak boleh negatif.

State diturunkan sebagai berikut:

```text
if outstanding == 0      -> PAID
else if allocated > 0    -> PARTIALLY_PAID
else                     -> OPEN
```

Dispute tidak mengubah state tersebut. Invoice dapat `PARTIALLY_PAID` sekaligus memiliki open dispute.

P0 hanya menyediakan payment yang langsung dialokasikan ke satu invoice. Data model tetap menggunakan `Payment` dan `PaymentAllocation` agar multi-allocation dapat ditambahkan tanpa migrasi konsep.

## Aging

```text
daysToDue = dueDate - asOfDate
daysOverdue = max(asOfDate - dueDate, 0)

if asOfDate <= dueDate    -> CURRENT
else if daysOverdue <= 7  -> OVERDUE_1_7
else if daysOverdue <= 30 -> OVERDUE_8_30
else if daysOverdue <= 60 -> OVERDUE_31_60
else if daysOverdue <= 90 -> OVERDUE_61_90
else                      -> OVERDUE_90_PLUS
```

Presentation flags:

- `DUE_SOON` jika `1 <= daysToDue <= 7`.
- `DUE_TODAY` jika `daysToDue == 0`.
- `OVERDUE` jika `asOfDate > dueDate` dan outstanding `> 0`.
- Paid invoice tetap mempunyai tanggal historis, tetapi tidak masuk outstanding aging totals.

Aging dihitung saat query/report memakai `asOfDate`. Tidak diperlukan cron untuk menulis ulang semua row setiap hari.

## Promise-to-pay lifecycle

Promise mempunyai `amount`, `promiseDate`, `createdAt`, dan status berikut:

```text
FULFILLED  payment allocations after promise creation cover promise amount
CANCELLED  operator cancels with reason
BROKEN     asOfDate > promiseDate and not fulfilled/cancelled
DUE        asOfDate == promiseDate and not fulfilled/cancelled
ACTIVE     asOfDate < promiseDate and not fulfilled/cancelled
```

Rules:

- Amount harus `> 0` dan tidak melebihi invoice outstanding saat promise dibuat.
- Satu invoice boleh punya history beberapa promises, tetapi hanya satu promise non-final (`ACTIVE`/`DUE`) pada MVP.
- Allocation setelah `createdAt` dihitung terhadap fulfillment. Jika jumlahnya mencapai promise amount, status menjadi `FULFILLED` walau invoice belum lunas.
- Status date-driven (`ACTIVE`, `DUE`, `BROKEN`) dihitung saat read. `FULFILLED` dan `CANCELLED` adalah event persisted.
- Broken promise masuk report dan menaikkan prioritas queue.

## Dispute lifecycle

Status dispute: `OPEN` atau `RESOLVED`.

- Open dispute mengecualikan invoice dari normal collection queue.
- Invoice tetap masuk AR/aging metrics dan ditandai sebagai disputed.
- Resolve membutuhkan timestamp, actor, dan optional resolution note.
- Setelah seluruh dispute resolved, invoice kembali eligible untuk normal queue.
- Payment tetap dapat direkam saat dispute open setelah operator melakukan reconciliation.

## Communication and next follow-up

Communication mencatat timestamp, channel (`WHATSAPP`, `CALL`, `EMAIL`, `OTHER`), notes, actor, dan optional `nextFollowUpDate`.

Default suggestion:

- tanpa promise: besok;
- promise aktif: satu hari sebelum `promiseDate`, tidak lebih awal dari besok;
- open dispute: tidak membuat normal collection task; resolution ditangani terpisah.

Operator dapat mengganti suggestion. Nilai final yang disimpan harus eksplisit agar queue tidak menebak niat operator.

## Collection queue eligibility

Invoice eligible jika semua kondisi dasar terpenuhi:

```text
invoiceState in [OPEN, PARTIALLY_PAID]
outstanding > 0
no OPEN dispute
```

Lalu minimal satu trigger terpenuhi:

- invoice overdue;
- `nextFollowUpDate <= asOfDate`;
- promise berstatus `DUE` atau `BROKEN`;
- belum pernah dihubungi dan due dalam 7 hari.

Promise `ACTIVE` yang masih jauh tidak otomatis membuat task hari ini. Task muncul berdasarkan `nextFollowUpDate`, biasanya satu hari sebelum promise.

## Priority score

Score dipakai hanya untuk sorting eligible invoices, bukan keputusan legal/credit:

```text
amountPoints  = (outstanding / 1_000_000) * 1.5
agingPoints   = daysOverdue * 0.1
stalePoints   = min(daysSinceLastContact, 30) * 0.5
promisePoints = 20 if BROKEN, 10 if DUE, otherwise 0
dueSoonPoints = 5 if never contacted and due within 7 days, otherwise 0

priorityScore = amountPoints
              + agingPoints
              + stalePoints
              + promisePoints
              + dueSoonPoints
```

Jika belum pernah dihubungi, `daysSinceLastContact` diperlakukan sebagai 30. Tie-breaker: oldest due date, largest outstanding, lalu invoice ID. UI boleh menjelaskan komponen score; operator tidak dapat mengubah formula pada MVP.

## Dashboard and report metrics

- **Total AR:** sum outstanding untuk invoice `OPEN` dan `PARTIALLY_PAID`.
- **Total overdue:** sum outstanding dengan `asOfDate > dueDate`.
- **Overdue percent:** `totalOverdue / totalAR * 100`; hasil 0 jika total AR 0.
- **Collected in period:** sum allocation amount dengan allocation date dalam period, bukan payment header date.
- **Open disputes:** count dan sum outstanding invoice dengan minimal satu open dispute.
- **Active promises:** count dan promised amount untuk status `ACTIVE` atau `DUE`.
- **Broken promises:** count dan promised amount untuk status `BROKEN`.
- **Aging totals:** sum outstanding grouped by aging bucket; paid invoices excluded.

Semua metric period memakai batas tanggal inklusif yang jelas dalam organization timezone.

## Import transaction rules

- Preview tidak mengubah debtor/invoice/payment production records.
- Commit menyimpan semua valid preview rows dalam satu transaction per import job.
- Invalid dan duplicate rows tidak ikut commit.
- Jika transaction gagal, tidak ada valid row yang tersimpan.
- Job dan row results tetap tersedia untuk audit.
- Import awal dengan `paid_amount > 0` membuat opening payment/allocation yang dapat ditelusuri, bukan hanya menulis outstanding secara langsung.

Detail parsing berada di [CSV import contract](06-csv-import-contract.md).

## Audit events

Minimal events:

`USER_LOGIN_SUCCESS`, `USER_LOGIN_FAIL`, `MEMBER_CREATED`, `IMPORT_PREVIEWED`, `IMPORT_COMMITTED`, `COMMUNICATION_CREATED`, `PROMISE_CREATED`, `PROMISE_CANCELLED`, `DISPUTE_CREATED`, `DISPUTE_RESOLVED`, `PAYMENT_CREATED`, `PAYMENT_ALLOCATED`, dan `REPORT_GENERATED`.

Audit entry memuat organization, actor jika ada, action, entity type/id, timestamp, request ID, dan metadata non-sensitive. Password, JWT/session token, dan full CSV row tidak boleh masuk audit/log.
