# CSV import contract

Status: authoritative untuk file format, parsing, validation, preview, dan commit invoice import.

## File-level contract

- Content type: CSV only; extension `.csv`.
- Encoding: UTF-8, optional BOM.
- Delimiter P0: comma.
- Header row wajib ada dan case-insensitive setelah trim.
- File size maksimum 5 MB dan maksimum 10,000 data rows untuk pilot.
- Unknown columns diabaikan dengan warning agar export client tidak gagal hanya karena kolom tambahan.
- Duplicate header, missing mandatory header, malformed quoting, atau jumlah column yang rusak adalah whole-file error.
- Raw upload tidak perlu disimpan permanen. Simpan file hash, filename, job metadata, normalized row payload, dan result.

## Canonical columns

| Column | Required | Meaning |
| --- | --- | --- |
| `customer_code` | No | Stable external debtor identifier; preferred match key |
| `customer_name` | Yes | Debtor legal/trading name |
| `contact_name` | No | Primary PIC; may be retained as import metadata in P0 |
| `phone_number` | No | Primary debtor phone |
| `email` | No | Primary debtor email |
| `invoice_number` | Yes | Invoice identity within organization |
| `invoice_date` | Yes | Issue date |
| `due_date` | Yes | Contractual due date |
| `original_amount` | Yes | Invoice gross amount |
| `paid_amount` | No | Amount paid before import; defaults to zero |
| `outstanding_amount` | No | Cross-check only; not an independent source of truth |
| `salesperson` | No | Optional metadata |
| `branch` | No | Optional metadata |
| `notes` | No | Optional source note |

P0 tidak menyediakan column-mapping UI. Client menyesuaikan export ke template ini.

## Normalization

- Header dan values di-trim.
- Empty string menjadi null untuk optional field.
- Customer/invoice codes disimpan original dan normalized variants untuk matching.
- Email dinormalisasi lowercase.
- Phone hanya dinormalisasi secara ringan; original value tetap tersedia.
- Formula-like cell prefixes (`=`, `+`, `-`, `@`) diperlakukan sebagai plain text dan di-escape saat diekspor kembali untuk mencegah CSV injection.

### Date parsing

Accepted formats:

- `YYYY-MM-DD` (preferred and unambiguous)
- `DD/MM/YYYY`

`MM/DD/YYYY` tidak diterima karena ambigu. Date invalid, rollover seperti `31/02/2026`, atau timestamp dengan timezone menghasilkan row error. `due_date` wajib dan tidak di-default ke net-30 pada P0. `due_date < invoice_date` adalah error.

### Rupiah parsing

Accepted examples:

```text
1500000
1500000.50
1.500.000
1.500.000,50
Rp 1.500.000,50
```

Parser harus menentukan format secara eksplisit:

- Jika string memakai `.` dan `,`, separator terakhir adalah decimal separator dan lainnya thousands separator.
- Jika hanya `,`, comma adalah decimal separator kecuali pola grouping jelas berulang.
- Jika hanya `.`, nilai dengan grouping tiga digit berulang dapat dianggap Indonesian thousands separator; nilai lain memakai decimal point.
- Currency symbol dan whitespace dibuang sebelum parse.
- Scientific notation, negative amount, NaN, dan infinity ditolak.

Hasil parsing harus exact decimal, bukan JavaScript float.

## Row validation order

1. Required fields tersedia.
2. Field lengths aman (`invoice_number` maksimum 50; names maksimum 200).
3. Dates valid dan due date tidak sebelum invoice date.
4. `original_amount > 0`.
5. `0 <= paid_amount <= original_amount`.
6. Jika `outstanding_amount` diisi, nilainya sama dengan `original_amount - paid_amount` setelah scale rounding.
7. Debtor dapat di-match/create tanpa ambiguity.
8. Invoice number belum ada di organization dan belum muncul pada valid rows dalam file yang sama.

## Debtor matching

Order:

1. Jika `customer_code` tersedia, exact normalized code match.
2. Jika tidak ada code, exact case-insensitive normalized name match.
3. Jika tidak ada match, preview menandai debtor sebagai `WILL_CREATE`.
4. Jika code cocok tetapi name berbeda, row valid dengan warning dan memakai existing debtor; operator harus melihat warning sebelum commit.
5. Jika name cocok ke lebih dari satu legacy debtor, row invalid sebagai ambiguous. P0 tidak memakai fuzzy matching.

## Error and warning codes

Stable codes memudahkan UI dan testing:

- `MISSING_REQUIRED_HEADER`
- `MISSING_REQUIRED_VALUE`
- `INVALID_DATE`
- `DUE_BEFORE_INVOICE_DATE`
- `INVALID_AMOUNT`
- `PAID_EXCEEDS_ORIGINAL`
- `OUTSTANDING_MISMATCH`
- `FIELD_TOO_LONG`
- `DUPLICATE_IN_DATABASE`
- `DUPLICATE_IN_FILE`
- `AMBIGUOUS_DEBTOR`
- `DEBTOR_NAME_MISMATCH` (warning)
- `UNKNOWN_COLUMN` (warning)

UI menampilkan human-readable Indonesian/English message serta row number; code tetap dipakai di API/test.

## Preview lifecycle

```text
upload -> PREVIEWING -> READY -> COMMITTED
                    \-> FAILED
                         READY -> CANCELLED
```

- Preview melakukan parsing dan validation tetapi tidak membuat debtor, invoice, payment, atau allocation.
- Summary menampilkan valid, invalid, duplicate, warning, dan total rows.
- Operator boleh commit valid rows walau ada invalid rows.
- Commit hanya diperbolehkan sekali dan harus idempotent.
- Database berubah setelah successful transaction; job menjadi `COMMITTED` dan row mendapat target IDs.

## Opening paid amount

Untuk row dengan `paid_amount > 0`, commit membuat opening `Payment` dan `PaymentAllocation` yang ditandai sebagai import opening balance. Ini menjaga:

```text
outstanding = originalAmount - allocations
```

Jika paid amount sama dengan original, invoice derived state menjadi `PAID` dan tidak masuk collection queue.

## Example

```csv
customer_code,customer_name,invoice_number,invoice_date,due_date,original_amount,paid_amount
CUST-001,PT Surya Sentosa,INV-2026-001,2026-06-01,2026-06-30,"1.250.000.000",0
,Cemara Utama,INV-2026-050,2026-06-15,,500000000,0
```

Row pertama valid. Row kedua mendapat `MISSING_REQUIRED_VALUE` pada `due_date`.

## Acceptance fixtures

Repository harus memiliki fixture minimal:

- valid canonical CSV;
- valid Indonesian amount formats;
- partial paid opening balance;
- missing header;
- invalid/ambiguous date;
- bad quoting;
- duplicate in file;
- duplicate in database;
- debtor code/name warning;
- outstanding mismatch;
- CSV injection-like text value.

Expected normalized results disimpan bersama fixture agar parser tests bersifat deterministic.
