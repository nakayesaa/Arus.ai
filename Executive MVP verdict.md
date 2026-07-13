# Executive MVP verdict

> Historical source document. The active, normalized documentation starts at [docs/README.md](docs/README.md). If this document conflicts with a modular document, the modular document is authoritative.

The proposed AR Collections Operating System can be delivered as an internal web application in 14 days by a solo technical founder. The MVP will focus on core **receivables tracking and collection workflow** – importing invoice data, calculating aging, prioritizing overdue accounts, logging follow-ups, tracking payment promises and disputes, and generating simple reports. Everything beyond this (automated messaging, ERP integrations, AI, client portals) is deferred. In practice, the system will serve as a back-office tool and demo environment for managed AR services, not a standalone SaaS product. With strict scope control and manual review for sensitive steps, this MVP can be built, deployed, and demonstrated within two weeks. The risk is that unpaid invoices often involve external factors beyond the software, but by targeting small–mid B2B clients with simple workflows, the founder can validate the service without overengineering.

## Day-14 product definition

By day 14 the product will be a **multi-tenant internal AR collection workspace**. It is an **operations tool** (not a public-facing platform) where the founder (and future collection staff) log in to manage each client’s receivables. The system allows uploading and validating invoice data, computes aging, generates a prioritized task queue of overdue accounts, and tracks each customer interaction (calls, WhatsApp, promises, disputes, payments). It provides dashboards and a simple weekly report PDF, but does *not* replace the client’s accounting system or send automated messages. In effect, the product is a **collections** **CRM and workflow manager** for use by the AR operator. It is not a full ERP or accounting tool, not a debt collection agency, and not fully automated. The founder will use it behind the scenes to demonstrate faster collections and better visibility.

**Product positioning statement:** *“AR Collections OS is an internal, multi-tenant AR workflow tool that the operator uses to collect invoices faster and give business owners clear visibility, while the client continues using their usual accounting system.”*

## P0, P1, P2, and Rejected features

We categorize features into must-have (P0), nice-to-have after MVP (P1/P2), and explicitly out-of-scope for the 14-day build. Features are judged on core workflow necessity and founder capacity.

- **P0 (Must have by Day 14)** – Critical features to meet the operational workflow:
- **User Authentication** (login/signup).
  - *User story:* As an operator, I log in securely to use the system.
  - *Business purpose:* Ensure data is private per organization.
  - *Requirements:* Email/password login, password hashing. MFA is optional (deferred).
  - *Acceptance:* Can register and log in; invalid credentials rejected; password reset link (optional).
  - *Failure:* Bad login shows error; no user sees another org’s data.
  - *Dependencies:* DB user table, encryption library.
  - *Dev hours:* 2–4 hrs.
- **Organization & Membership Model**.
  - *User story:* Founder creates a new “organization” record for each client.
  - *Purpose:* Multi-tenancy – each client’s data is isolated.
  - *Requirements:* Org entity, membership linking user↔org with role (e.g., Admin, Operator).
  - *Acceptance:* New org can be created; members invited/assigned. OrgId is attached to all data.
  - *Failure:* Org not created, or no OrgId on records.
  - *Dependencies:* Auth; DB schema.
  - *Dev hours:* 3–5 hrs.
- **RBAC (Minimal roles)**.
  - *User story:* Admin can manage users; Operator can manage data.
  - *Purpose:* Differentiate founder (owner) vs. client accountant (if later).
  - *Requirements:* Roles (e.g., Owner, User), middleware enforcing permissions.
  - *Acceptance:* Only Owner can add users; normal user can create tasks etc.
  - *Failure:* Role checks bypassed.
  - *Dev hours:* 2 hrs.
- **Multi-tenant Isolation**.
  - *User story:* Data for Org A is never visible to Org B.
  - *Purpose:* Data security and privacy per client.
  - *Requirements:* All queries scoped by session’s org ID; tests to ensure isolation.
  - *Acceptance:* Org filter applied to every DB query.
  - *Dev hours:* 2 hrs.
- **Debtor (Customer) Management**.
  - *User story:* I create and view customer (debtor) records.
  - *Purpose:* Store debtor info (name, code, contacts).
  - *Requirements:* Debtor entity with name, code, contact details.
  - *Acceptance:* Debtors CRUD; Import should create new or match existing.
  - *Failure:* Duplicate debtors or missing mapping.
  - *Dev hours:* 4 hrs.
- **CSV Invoice Import**.
  - *User story:* I upload an invoice CSV export from the client’s system.
  - *Purpose:* Bulk input of invoice data.
  - *Requirements:* File upload, column mapping or template, row validation, preview.
  - *Acceptance:* File of correct format is parsed; errors flagged; valid rows saved.
  - *Failure:* Malformed file yields clear errors; duplicate invoice handling.
  - *Dev hours:* 8–12 hrs.
- **Import Validation & Duplicate Detection**.
  - *User story:* Invalid rows are reported, duplicates skipped or updated.
  - *Purpose:* Prevent bad data and duplicates.
  - *Requirements:* Check required fields (invoice#, date, amount); detect same invoice number in same org.
  - *Acceptance:* Every invalid row shows an error message; duplicates are either merged or rejected.
  - *Failure:* Invalid data inserted silently, or duplicates create double-count.
  - *Dev hours:* 4 hrs.
- **Aging Calculation**.
  - *User story:* The system shows days overdue for each invoice.
  - *Purpose:* Determine due/overdue buckets.
  - *Requirements:* Compute  daysOverdue = today - dueDate . Set status: NotDue, DueSoon, Overdue1-7, Overdue8-30, etc.
  - *Acceptance:* Each invoice shows correct aging bucket.
  - *Failure:* Wrong bucket; due date in future mis-classified.
  - *Dev hours:* 3 hrs.
- **Invoice List & Filtering**.
  - *User story:* I view all imported invoices and filter by status, debtor, etc.
  - *Purpose:* Quick navigation of receivables.
  - *Requirements:* List page with columns (number, date, amount, due date, status); filters for overdue, debtor, etc.
  - *Acceptance:* Can search or filter; list updates accordingly.
  - *Failure:* Filter not working or missing fields.
  - *Dev hours:* 4 hrs.
- **Invoice Detail & Debtor Profile**.
  - *User story:* I open an invoice to see details and history, and view debtor summary.
  - *Purpose:* Single-invoice view and summary of customer.
  - *Requirements:* Detail page showing all fields, balance, promises, disputes, history. Debtor page listing all invoices and stats.
  - *Acceptance:* Accurate data shown; links between invoices and debtor.
  - *Dev hours:* 4 hrs.
- **Collection Priority Scoring & Task Queue**.
  - *User story:* The system suggests which invoice to contact next.
  - *Purpose:* Focus effort on highest-priority overdue accounts.
  - *Requirements:* A simple score (e.g.  amount * (1 + overdueDays/30) ) or weighted sum (see rules below) to sort. A “Tasks” view listing invoices due for follow-up today, sorted by priority.
  - *Acceptance:* Today’s queue shows the most overdue/high-value first.
  - *Failure:* No queue visible or random order.
  - *Dev hours:* 4 hrs.
- **Communication Logging**.
  - *User story:* After each contact (WhatsApp/email/call), I log a note.
  - *Purpose:* Track follow-up attempts and responses.
  - *Requirements:* Form on invoice or task to enter date, mode (W/A call, notes). Save history chronologically.
  - *Acceptance:* Each log appears under invoice and in reports.
  - *Failure:* Notes not saved or visible.
  - *Dev hours:* 4 hrs.
- **Promise-to-Pay (PTP) Tracking**.
  - *User story:* I record when a customer promises to pay (amount and date).
  - *Purpose:* Monitor commitments and detect broken promises.
  - *Requirements:* Can add a PTP entry (amount, due date). System flags when date passes without payment.
  - *Acceptance:* PTP shows in invoice view; if due date < today and no payment, mark “broken”.
  - *Failure:* No tracking of promised dates.
  - *Dev hours:* 3 hrs.
- **Invoice Dispute Tracking**.
  - *User story:* I can record a dispute reason (e.g. missing POD, wrong amount).
  - *Purpose:* Log reasons for non-payment that require resolution.
  - *Requirements:* Add dispute with category and notes. Mark invoice as “on dispute” so it may be temporarily excluded from follow-up.
  - *Acceptance:* Dispute shows on invoice; invoice is flagged (e.g. “Disputed”).
  - *Dev hours:* 3 hrs.
- **Manual Payment Recording & Allocation**.
  - *User story:* When a payment arrives, I record it and apply to invoices.
  - *Purpose:* Update balances and close invoices.
  - *Requirements:* Create payment (date, amount, source). Allocate to one or more invoices (with partial/overpayment logic). Update outstanding amounts.
  - *Acceptance:* Invoice balances reduce correctly; partial payments leave correct remaining balance; unallocated amount is shown.
  - *Failure:* Balances wrong or allocation silent fails.
  - *Dev hours:* 6–8 hrs (high risk).
- **Partial Payments**.
  - *User story:* A partial payment reduces the balance.
  - *Purpose:* Handle installment or partial fulfillment.
  - *Requirements:* In allocation, allow invoice to remain open with new balance.
  - *Acceptance:* Invoice outstanding = original – sum(allocations).
  - *Failure:* Either full payment or no flexibility.
  - *Dev hours:* included above.
- **Basic Weekly Report**.
  - *User story:* I generate a PDF/Excel weekly summary for the owner.
  - *Purpose:* Provide management visibility.
  - *Requirements:* Summarize total outstanding, collected last week, new PTPs, broken promises, unresolved disputes, and tasks. Possibly as a downloadable PDF/CSV or email.
  - *Acceptance:* Report reflects current data; email trigger is optional (manual download ok).
  - *Dev hours:* 4 hrs.
- **Dashboard Metrics**.
  - *User story:* Upon login, I see key AR metrics (total AR, % overdue, aging chart).
  - *Purpose:* At-a-glance status for operator/owner.
  - *Requirements:* Show totals and breakdown by bucket (e.g. 0-30, 31-60, 61-90 days).
  - *Acceptance:* Metrics match underlying data (cross-checked).
  - *Dev hours:* 3 hrs.
- **Basic Audit Logging**.
  - *User story:* All key actions (import, data changes) are logged with who/when.
  - *Purpose:* Accountability and data integrity.
  - *Requirements:* Record events like import job created/completed, invoice added/edited, payment created, etc.
  - *Acceptance:* Admin can view an audit log with timestamp and user.
  - *Dev hours:* 3 hrs.
- **P1 (Build if P0 complete)** – Useful but not absolutely essential for initial demo:
- **Debtor Contact Management** – multiple contacts per customer (could defer, use primary only).
- **Reminder Template Drafting** – auto-generate WhatsApp message (as plain text to copy), optional.
- **Click-to-WhatsApp Links** – have a link that opens WhatsApp Web to a number with pre-filled text.
- **Email Sending Integration** – allowing email reminders (likely out-of-scope; can rely on operator email).
- **Permission Roles** – adding more granular roles (Viewer, Auditor).
- **Client Read-Only Portal** – read-only login for client to view dashboard (deferred; not needed for MVP).
- **Data Export** – allow CSV/PDF export of lists (nice to have).
- **P2 (After first clients)** – Things to add when scaling or after pilot:
- **Official WhatsApp API** – automate sending messages (only when many clients justify cost).
- **OCR / Document Extraction** – for invoice/POD images (likely not needed initially).
- **Accounting Software Integration** – connect to Jurnal/Accurate (complex; not for MVP).
- **Cash Forecasting** – predictive analytics (requires data history).
- **Debtor Risk Scoring** – credit analysis (requires finance data; out-of-scope).
- **Mobile-optimized UI** – if many operators need phones.
- **Rejected (Out-of-scope)** for MVP:
- Client self-service portal (login for customer is not needed).
- Automated debt collection (sending demand letters, legal notices).
- AI chatbots or NLP to negotiate payment.
- Complex workflow builder.
- File storage beyond simple upload (no need for full S3 logic).
- Payment gateways, invoicing, lending, etc.
- Tax/calculation features (product just tracks existing invoices).

**Note:** We explicitly assume no credit-lending, no legal enforcement, and full human review of all messages. The focus is on tracking and human-driven follow-up.

## Product demonstration flow

A 10-minute demo will follow the happy path of using the MVP on a sample client dataset. We imagine a fictitious Surabaya distributor **PT Bumi Makmur Abadi** with ~10 customers and 30 invoices. The flow is:

1. **Login** – Show the login screen; enter email/password and click login. The system lands on the **Dashboard**.
2. **AR Overview** – The dashboard displays total receivables, percent overdue, and a chart of aging buckets (0-30,31-60,etc). For example, "Total AR: Rp 2,500,000,000; 60% overdue".
3. **Import Invoices** – Click “Import Invoices” page. Demonstrate uploading  invoices_sample.csv . The preview shows some red error rows (e.g. missing due date, invalid date format). Correct the source file or fix mapping. Retry import.
4. **Import Success** – A success message “50 invoices imported, 2 errors”. The error report is available to download.
5. **View Aging Buckets** – Navigate to the **Aging Dashboard** or **Invoices List**. Show that each imported invoice now appears with a calculated days-overdue. Filter to “Overdue > 30 days” to see, e.g., 5 invoices overdue 31–60 and 3 invoices 61–90.
6. **Debtor Profile** – Click on one debtor (e.g. “PT Tiga Industri”) to open their profile. Show their contact info, credit terms (optional), and a list of their invoices. Display stats: “This customer has 4 open invoices, total Rp 500M, average 45 days late.”
7. **Collection Queue** – Go to **Tasks / Queue**. This shows a list of invoices due for follow-up today, sorted by our priority score (e.g. largest overdue first). For example:
8. INV-103 (Rp 150M, 45 days overdue) – “Last contact: 10 days ago, phone call.”
9. INV-110 (Rp 20M, 62 days overdue) – “Promise to pay was missed”.
10. INV-107 (Rp 80M, 18 days overdue) – “Overdue, no promises or disputes.”

11. **Record Communication** – Select INV-103. A modal or form pops up to **Log Follow-up**. Choose “WhatsApp”, enter notes “Called customer, they said POD was missing.” Click Save. The invoice detail updates: “Last contact: [date], note: ‘Called, POD missing’.”

12. **Log Promise to Pay** – In INV-103 detail, click “Add Promise to Pay”. Enter Rp 150,000,000 by [date+7 days]. Save. The invoice now shows a promise due on that date.

13. **Show Broken Promise** – Adjust system date (or simulate a past date). The promises list shows INV-110 had a promise due yesterday but no payment recorded, flagged as **Broken Promise** (red).

14. **Create Dispute** – For INV-103, in notes we said “POD missing”. Click “Add Dispute” and select “Missing POD” with note “Requesting signed POD from warehouse”. The invoice is now marked “Disputed”.

15. **Record Payment** – A payment arrives. Go to **Payments**, click “Add Payment” for Rp 150,000,000 from PT Tiga Industri. Allocate it fully to INV-103. Save. INV-103 balance goes to Rp 0 and status becomes **Paid**.

16. **View Updated Balances** – Return to the customer profile or invoice list. INV-103 now shows Paid. Total AR reduced accordingly. The dashboard metrics update (e.g. “Cash collected this week: Rp 150M; Overdue % now 55%”).

17. **Generate Weekly Report** – Click “Generate Report”. A PDF shows up (or previews) summarizing: “Week of [dates]: Collected Rp 150M, 2 promises logged (Rp 170M), 1 broken promise (Rp 20M), 2 disputes open, 5 invoices still overdue >30d.”

Throughout the demo, the SaaS is shown as a backend tool (no client portal view). We emphasize that all emails/WhatsApps are prepared and reviewed by us. The demo uses hypothetical Indonesian names (company names, invoice numbers) and currency in Rupiah. No real customer data is shown.

## User flows

We detail each core user flow of the MVP, focusing on actor action and system behavior. Each flow ends with an “Audit event” entry (e.g.,  CREATE_INVOICE_IMPORT ,  LOG_PTP , etc.).

1. **Organization & User Setup** (Founder only)
2. **Start:** No organization or user exists.
3. **User action:** Founder signs up (POST  /auth/signup  or admin endpoint  POST /orgs ).
4. **API:** POST /organizations with {name, admin email}.
5. **Backend:** Create Organization record; create User record with role=Owner; create Membership linking user to org.
6. **DB:** org table gets new row with id; user table gets new row; membership table row.
7. **UI:** Redirect to login or dashboard as Owner of new Org.
8. **Audit:** Log  ORG_CREATED ,  USER_CREATED .
9. **Final:** Founder is logged in under a new Org context.
10. **User Login**

11. **Start:** Login page shown.

12. **Action:** User enters credentials and submits.

13. **API:** POST /auth/login {email, password}.

14. **Backend:** Verify credentials (bcrypt compare), check if user is active. Fetch user with roles/ membership. Create session (JWT or server session).

15. **DB:** No change (just read user).

16. **UI:** On success, redirect to /dashboard. On fail, show error.

17. **Error:** Wrong creds shows “Invalid email or password”.

18. **Audit:** Log  USER_LOGIN_SUCCESS  or  USER_LOGIN_FAIL .

19. **Final:** Authenticated session established with orgId attached.

20. **Import Debtors and Invoices**

21. **Start:** On “Import” page; user has a CSV file prepared.

22. **Action:** User uploads CSV file (sends FormData).

23. **API:** POST /imports/invoices (file upload).

24. **Backend:** Save raw file or buffer; parse CSV rows. For each row:

  - Validate required columns (invoice_number, customer_name, etc.).
  - Normalize data (e.g. parse numbers, dates).
  - Check duplicates (if invoice_number already exists for org).
  - If invalid or duplicate, mark row error; else insert into a temp table or buffer.
25. **DB:** Store an ImportJob record with status  Processing . Insert valid invoice rows into Invoice table (tentatively, with reference to ImportJob). Debtor: try match by code/name; create new if not found.

26. **UI:** Show progress; on complete, display count of imported vs errors. Offer “View Import Report”.

27. **Error:** If whole file corrupt, abort with error. If some rows error, user sees row-by-row messages (e.g. “Row 5: Missing due date”).

28. **Audit:** Log  IMPORT_STARTED  and  IMPORT_COMPLETED  with counts.

29. **Final:** Invoices and debtors from CSV are now in the system.

30. **System Validates File (Import Preview)**

31. **Start:** After file upload but before commit.

32. **Action:** System shows a preview of rows with validation results. User can fix CSV and re-upload or proceed ignoring bad rows.

33. **API:** GET /imports/:id/results.

34. **Backend:** Fetch records from ImportError or temp table.

35. **UI:** Tabular view: good rows vs error rows. User can choose to “Import valid rows only” or “Cancel”.

36. **Audit:** Included in import logs.

37. **Final:** Only valid rows are inserted into final tables.

38. **Aging Calculation (Automatic)**

39. **Start:** After any data change or on daily cron.

40. **Action:** System calculates aging for all invoices (no UI step).

41. **Backend:** For each invoice, set  daysOverdue = CURRENT_DATE - due_date . Determine `agingBucket` enum (NotDue, DueSoon, Overdue7, Overdue30, etc).

42. **DB:** Update Invoice.status/agingBucket fields.

43. **UI:** Upcoming views (Dashboard, list) show updated buckets.

44. **Audit:** No explicit audit (background process).

45. **Final:** Each invoice has an updated bucket.

46. **Operator Views Priority Queue**

47. **Start:** Invoices exist with aging data.

48. **Action:** Operator navigates to “Collection Tasks”.

49. **API:** GET /collection-tasks?date=TODAY

50. **Backend:** Query invoices where  status=open AND (dueDate <= today OR previously promised). Score each by priority formula. Return sorted list.

51. **DB:** Read-only.

52. **UI:** Show table: Invoice#, Debtor, Amount, Days overdue, Last Contact, Action needed.

53. **Error:** If no invoices, display “No tasks due today.”

54. **Audit:** Log  TASK_LIST_VIEWED .

55. **Final:** Operator sees list of invoices to contact today.

56. **Operator Opens an Invoice Detail**

57. **Start:** On task queue or invoice list.

58. **Action:** Click invoice INV-#####.

59. **API:** GET /invoices/:id (with org scope check).

60. **Backend:** Fetch invoice, related payments, communications, PTPs, disputes.

61. **DB:** Read-only.

62. **UI:** Display all fields: invoice number, dates, amounts, status, outstanding balance, list of communications, list of PTPs, disputes, and notes.

63. **Error:** 404 if not found or org mismatch.

64. **Audit:** Log  INVOICE_VIEWED .

65. **Final:** Invoice detail page shown.

66. **Operator Records a Follow-up (Communication)**

67. **Start:** On invoice detail.

68. **Action:** Click “Add Communication”, enter date, channel (e.g. WhatsApp), notes.

69. **API:** POST /communications {invoiceId, date, channel, notes}.

70. **Backend:** Validate invoice belongs to org. Insert new Communication record. Update invoice.lastContactDate. If relevant, set  lastContactBy=this user .

71. **DB:** New communication row; Invoice table updated.

72. **UI:** Show confirmation message; new entry appears in history.

73. **Error:** If fields missing, show error.

74. **Audit:** Log  COMM_CREATED .

75. **Final:** Invoice history updated with this follow-up.

76. **Operator Records a Debtor Response / Promise**

77. **Start:** Immediately after a communication (or separately).

78. **Action:** On invoice page, click “Record Promise to Pay”. Input promised amount and date.

79. **API:** POST /promises {invoiceId, dueDate, amount}.

80. **Backend:** Create PromiseToPay entry linked to invoice. Mark invoice.hasActivePromise=true.

81. **DB:** New promise row (status = Active).

82. **UI:** Promise appears in list under invoice. Next to it, if date > today, “pending”; if date = today, “due today”; if date passed, “broken”.

83. **Audit:** Log  PROMISE_CREATED .

84. **Final:** Customer promise is now tracked.

85. **System Detects Broken Promise**

  - **Start:** Cron or daily check when  today > promised date .
  - **Action:** System finds any active promises whose date < today and no payment allocated.
  - **API:** (Internal) check promises.
  - **Backend:** For each promise, check if  invoice.outstanding >= promisedAmount . If yes, mark that promise status = Broken and invoice.flagged.
  - **UI:** Mark on invoice: “Broken promise: Rp X on Y.” Show in reports.
  - **Audit:** Log  PROMISE_BROKEN .
  - **Final:** Broken promises are flagged.
86. **Operator Creates a Dispute**

  - **Start:** On invoice detail (e.g. after reading communication notes).
  - **Action:** Click “Add Dispute”, choose category (Missing POD, Price, etc), add notes.
  - **API:** POST /disputes {invoiceId, category, notes}.
  - **Backend:** Insert new Dispute (status=Open). Set invoice.isInDispute=true.
  - **DB:** Dispute row, invoice updated.
  - **UI:** Dispute shows on invoice; invoice list shows a “dispute” tag. Possibly pending tasks updated.
  - **Audit:** Log  DISPUTE_CREATED .
  - **Final:** Invoice is marked as disputed.
87. **Operator Records a Payment**

  - **Start:** Receiving a bank transfer.
  - **Action:** Go to “Payments” page, click “Record Payment”, enter date, amount, payer (debtor reference).
  - **API:** POST /payments {date, amount, payerId}.
  - **Backend:** Create Payment record. If amount > 0 and less than sum of org’s open invoices, keep unallocated balance.
  - **DB:** Payment row inserted.
  - **UI:** Show payment in list with status “Unallocated Rp amount.” Prompt to allocate.
  - **Audit:** Log  PAYMENT_CREATED .
  - **Final:** Payment record exists, waiting for allocation.
88. **Operator Allocates Payment to Invoice(s)**

  - **Start:** After creating a payment.
  - **Action:** On payment or invoice page, use “Allocate Payment” form: select invoice(s) and amount portions.
  - **API:** POST /payments/:paymentId/allocations {invoiceId, amount}. (Multiple calls as needed.)
  - **Backend:** For each allocation, create PaymentAllocation linking payment to invoice. Subtract amount from payment.unallocatedBalance and invoice.outstandingBalance. If invoice balance becomes 0, mark invoice.status=Paid.
  - **DB:** PaymentAllocation rows; update Payment and Invoice tables.
  - **UI:** Show updated outstanding on invoices and remaining unallocated on payment.
  - **Audit:** Log  PAYMENT_ALLOCATED .
  - **Final:** Invoice balances and payment records updated.
89. **Operator Generates Weekly Report**

  - **Start:** End of week.
  - **Action:** Click “Generate Report (Weekly)”.
  - **API:** GET /reports/weekly?from=YYYY-MM-DD&to=YYYY-MM-DD
  - **Backend:** Aggregate data: total invoiced, collected, new promises, broken promises, disputes opened/closed, etc. Render to PDF or CSV.
  - **UI:** Display or download the report.
  - **Audit:** Log  REPORT_GENERATED .
  - **Final:** Weekly report available for owner review.

Each flow ends with the system state appropriate (updated invoices, database records, etc.). Errors always result in user-friendly messages (e.g. “Invoice number is required”). All data changes are audited.

## Business rules

We use clear, deterministic rules for AR calculations and priorities:

- **Outstanding Balance:** invoice.outstanding = max(original_amount – `sum(payments_allocated_to_invoice), 0)`. Prevent negative balance by disallowing overallocation. If  payments > original , treat excess as unallocated.
- **Invoice Aging:**

```text
if today < due_date then status = "NotDue"
else days_overdue = today - due_date
  if days_overdue <= 7: bucket = "1-7"
  else if days_overdue <= 30: bucket = "8-30"
  else if days_overdue <= 60: bucket = "31-60"
  else if days_overdue <= 90: bucket = "61-90"
  else: bucket = "90+"
invoice.agingBucket = bucket
```

- **Due-Soon Classification:** If  0 < days_to_due <= 7 , flag as *Due Soon*. If  days_to_due <= 0 , it is *Overdue*.
- **Paid-in-Full Detection:** When outstanding = 0 (and no dispute requiring reversal), mark invoice.status = “Paid”. Remove it from the queue.
- **Partial-Payment Detection:** If  0 < outstanding < original , status = “Partially Paid”. Still in Overdue bucket if past due.
- **Promise-to-Pay (PTP) Status:**
- Active if promise date >= today and invoice is still open.
- Due if promise date == today.
- Broken if promise date < today and payment not received.
- On payment allocation that covers the promised amount, mark promise fulfilled and close it.
- **Duplicate-Invoice Detection:**
- If a new import row has the same invoice number and debtor as an existing one (in the same org), treat it as duplicate. Either skip or update existing (we skip in MVP, marking an error).
- *Pseudocode:*

```text
if exists invoice where (orgId, invoiceNumber) then error "Duplicate invoice".
```

- **Collection Task Generation:**
- At login or on-demand, tasks are generated for all invoices meeting:  status in [NotPaid, `PartiallyPaid] AND (due_date <= today OR hasActivePTP OR last_contact >= X` days ago), excluding those with open disputes.
- Each task is an invoice to follow up.
- **Collection Priority Scoring Formula:** We use a simple weighted score:

```text
score = (outstanding / 1e6) * 1.5
      + daysOverdue * 0.1
      + 10 * (hasActivePTP ? 1 : 0)
      + 20 * (hasBrokenPromise ? 1 : 0)
      - 5 * (daysSinceLastContact / 7)
```

Higher score means higher priority. In words: larger amounts and longer overdue get higher score; any active promise adds modest priority (to ensure it’s tracked), any broken promise adds a big bump (urgent); more recent contact slightly reduces urgency. The formula is transparent and can be overridden per-invoice (see UI).

- **Dispute Impact:**
- If an invoice has an **open dispute**, it should be **excluded from automated follow-ups** (since the issue is known). The operator will resolve the dispute first.
- However, the invoice still counts in metrics (as overdue but disputed).
- Once dispute is “Resolved”, the invoice re-enters normal flow.
- **Follow-up Scheduling:**
- After each contact, schedule next follow-up (suggested interval) e.g. `nextFollowUp = today + 7 days` if no response, or based on promise date.
- *Simplified rule:* If no promise, next follow-up = tomorrow; if promise exists, schedule a reminder 1 day before promise date.
- **Payment Allocation Validation:**
- Prevent allocating more than remaining invoice.
- If allocation amount > outstanding, reject.
- If allocation sum < invoice, invoice remains partial.

All these rules are deterministic and coded (no ML). They are logged for transparency.

## Database schema

**Entities and relationships (text ER diagram):**

- **Organization** (1) — (∞) **User** via **Membership**. Each Organization has many Users (members) with roles.
- **Organization** (1) — (∞) **Debtor**.
- **Debtor** (1) — (∞) **DebtorContact** (optional, for multiple PICs).
- **Debtor** (1) — (∞) **Invoice**.
- **Invoice** (1) — (∞) **Communication** (follow-up logs).
- **Invoice** (1) — (∞) **PromiseToPay**.
- **Invoice** (1) — (∞) **Dispute**.
- **Invoice** (1) — (∞) **PaymentAllocation** (many payments can allocate to one invoice).
- **Payment** (1) — (∞) **PaymentAllocation** (one payment can pay many invoices).
- **InvoiceImportJob** (1) — (∞) **ImportError** (errors per row).

All tables include  organizationId  (tenant scope), created/updated timestamps, and a primary key  id . Soft-delete (boolean  isDeleted ) can be added on Organization, User, Debtor, Invoice to allow recovery.

**Prisma schema outline (simplified):**

```prisma
model Organization {
  id      Int    @id @default(autoincrement())
  name    String
  // ... timestamps, other fields
  users   User[] @relation("OrgUsers")
  debtors Debtor[]
}

model User {
  id           Int          @id @default(autoincrement())
  email        String       @unique
  passwordHash String
  name         String?
  isActive     Boolean      @default(true)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  memberships  Membership[]
}

model Membership {
  userId Int
  orgId  Int
  role   String // e.g. OWNER, USER

  @@id([userId, orgId])

  user User         @relation(fields: [userId], references: [id])
  org  Organization @relation(fields: [orgId], references: [id])
}

model Debtor {
  id             Int       @id @default(autoincrement())
  organizationId Int
  code           String?   // external customer code
  name           String
  industry       String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  invoices       Invoice[]

  @@unique([organizationId, code])
  @@index([organizationId, name])
}

model DebtorContact {
  id       Int    @id @default(autoincrement())
  debtorId Int
  name     String
  phone    String?
  email    String?
  debtor   Debtor @relation(fields: [debtorId], references: [id])
}

model Invoice {
  id                Int       @id @default(autoincrement())
  organizationId    Int
  debtorId          Int
  invoiceNumber     String
  invoiceDate       DateTime
  dueDate           DateTime
  originalAmount    Decimal   // use Decimal for money
  outstandingAmount Decimal
  description       String?
  status            String    // e.g. OPEN, PAID, PARTIAL
  agingBucket       String
  lastContactDate   DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  org            Organization        @relation(fields: [organizationId], references: [id])
  debtor         Debtor              @relation(fields: [debtorId], references: [id])
  communications Communication[]
  promises       PromiseToPay[]
  disputes       Dispute[]
  allocations    PaymentAllocation[]

  @@index([organizationId, invoiceNumber], name: "unique_invoice_per_org", map: "unique_invoice")
}

model Communication {
  id        Int      @id @default(autoincrement())
  invoiceId Int
  date      DateTime
  channel   String   // e.g. "WhatsApp", "Call"
  notes     String
  userId    Int
  invoice   Invoice  @relation(fields: [invoiceId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
}

model PromiseToPay {
  id        Int      @id @default(autoincrement())
  invoiceId Int
  dueDate   DateTime
  amount    Decimal
  status    String   // Active, Fulfilled, Broken
  createdAt DateTime @default(now())
  invoice   Invoice  @relation(fields: [invoiceId], references: [id])
}

model Dispute {
  id        Int      @id @default(autoincrement())
  invoiceId Int
  category  String   // e.g. "Missing POD"
  details   String?
  status    String   // Open or Resolved
  createdAt DateTime @default(now())
  invoice   Invoice  @relation(fields: [invoiceId], references: [id])
}

model Payment {
  id             Int                 @id @default(autoincrement())
  organizationId Int
  amount         Decimal
  date           DateTime
  payerName      String?             // optionally link to Debtor
  createdAt      DateTime            @default(now())
  allocations    PaymentAllocation[]
  organization   Organization        @relation(fields: [organizationId], references: [id])
}

model PaymentAllocation {
  id        Int     @id @default(autoincrement())
  paymentId Int
  invoiceId Int
  amount    Decimal
  payment   Payment @relation(fields: [paymentId], references: [id])
  invoice   Invoice @relation(fields: [invoiceId], references: [id])
}

model InvoiceImportJob {
  id             Int           @id @default(autoincrement())
  organizationId Int
  filename       String
  status         String        // e.g. Pending, Processing, Completed
  createdAt      DateTime      @default(now())
  errors         ImportError[]
}

model ImportError {
  id           Int              @id @default(autoincrement())
  importJobId  Int
  rowNumber    Int
  errorMessage String
  importJob    InvoiceImportJob @relation(fields: [importJobId], references: [id])
}

model AuditLog {
  id             Int      @id @default(autoincrement())
  organizationId Int
  userId         Int?
  action         String   // e.g. "INVOICE_UPDATED"
  entity         String   // e.g. "Invoice"
  entityId       Int?
  timestamp      DateTime @default(now())
  details        String?
}
```

**Important constraints and indexes:**

- Unique: (organizationId, invoiceNumber) to prevent duplicate invoices within an org.
- We enforce payment allocations sum ≤ payment amount via application logic (no DB trigger).
- Outstanding balance never negative by checks in code or DB check constraint `outstandingAmount >= 0`.
- Indexes on  (organizationId)  for all tenant tables, on  (organizationId, invoiceDate) , (dueDate),  (debtorId) , and  (status) .
- Time-stamped fields ( createdAt ,  updatedAt ) allow tracking and back-filling.

**Invoice state vs aging vs workflow status:**

- **Aging bucket** (enum) is derived from date logic; stored for filtering.
- **Workflow status** (OPEN, PAID, PARTIAL) is separate. We keep them separate because aging changes daily, whereas status changes only on events. This avoids confusion and performance issues.

## API specification

All endpoints are prefixed by tenant context (e.g. determined by JWT orgId). We return JSON.

**Authentication:**

- `POST /auth/login` – Log in. *(Public)*
- Request:  {email, password} . Response:  {token}  or error.
- 401 if invalid credentials.
- `POST /auth/signup` (optional) – Create Owner user and org. *(Public for first user)*.
- `GET /auth/me` – Get current user details. *(Auth required)*.

**Organization:**

- `POST /organizations` – Create new org. *(Role: Owner)* (Often combined with signup).
- `GET /organizations` – List (should return only current org).

**Users & Memberships:**

- `POST /users` – Add user to org. *(Owner)* {email, role}. Sends invite link/email.
- `GET /users` – List users. *(Owner/Admin)*.
- `PATCH /users/:id` – Change role/active.
- `DELETE /users/:id` – Remove user.

**Debtors:**

- `GET /debtors` – List debtors (filter by name). *(Auth)*
- `GET /debtors/:id` – Debtor detail with invoice summary.
- `POST /debtors` – Create new debtor.
- `PATCH /debtors/:id` – Edit debtor.
- `DELETE /debtors/:id` – Soft-delete debtor.

**Invoices:**

- `GET /invoices` – List invoices with filters (status, overdue, debtor, date range). *Query params* for page.
- `GET /invoices/:id` – Get invoice detail (with communications, promises, disputes).
- `POST /invoices` – (Optional, manual creation) Create one invoice. P0 uses CSV instead.
- `PATCH /invoices/:id` – Update invoice (rare, only to correct data).
- `DELETE /invoices/:id` – (Optional) Remove invoice.

**Imports (Invoices):**

- `POST /imports/invoices` – Upload CSV file.
- `GET /imports/:id` – Get import job status (and view errors).
- `GET /imports/:id/errors` – Download error report.

**Collection Tasks:**

- `GET /collection-tasks` – List tasks (invoices) due for follow-up today. No body. Supports filter `?due= today/tomorrow`.
- `PATCH /collection-tasks/:invoiceId` – Mark task done or reschedule. (Used when operator completes follow-up.)

**Communications:**

- `GET /invoices/:id/communications` – List communications for invoice.
- `POST /communications` – Add communication log (fields: invoiceId, date, channel, notes).
- `PATCH /communications/:id` – (Optional) Edit note.

**Promises-to-Pay:**

- `GET /invoices/:id/promises` – List promises for invoice.
- `POST /promises` – Create promise (fields: invoiceId, dueDate, amount).
- `PATCH /promises/:id` – Update (e.g., mark as fulfilled or broken if manual override).
- The system auto-sets status; manual PATCH likely rare (admin override).

**Disputes:**

- `GET /invoices/:id/disputes` – List disputes.
- `POST /disputes` – Create dispute (invoiceId, category, details).
- `PATCH /disputes/:id` – Change status to Resolved/Closed.

**Payments:**

- `GET /payments` – List payments (filter by date range).
- `POST /payments` – Create payment (date, amount, payerName).
- `GET /payments/:id` – Detail with allocations.
- `POST /payments/:id/allocations` – Allocate to invoice (invoiceId, amount).
- `DELETE /payments/:id` – Delete payment (if no allocations).

**Reports:**

- `GET /reports/weekly?from=&to=` – Generate weekly/period report. Returns PDF or JSON summary.

**Audit Logs:**

- `GET /audit-logs` – List audit entries (Owner role only). Support filters (date, user, action).

**Cross-cutting:**

- All endpoints require authentication (except /auth).
- Tenant-isolation: Every query uses  WHERE organizationId = currentOrgId  (server enforces).

We use consistent error format  {error: "message"} . 400 for validation errors, 401/403 for auth issues, 404 if not found. Pagination via  ?page=  and  ?limit=  as needed.

## Frontend specification

We build a simple Next.js UI (desktop-first) for these core screens. The main user is the Operator or Founder (owner). We list each screen:

1. **Login Page**
2. **User:** Operator/Founder.
3. **Objective:** Authenticate user.
4. **Components:** Email and password fields, submit button, forgot password link.
5. **Data:** No data prior; on submit calls  /auth/login .
6. **Actions:** Enter credentials, click Login.
7. **Loading:** Disable form and show spinner during request.
8. **Empty/Error:** If error, show message “Invalid credentials.”
9. **Mobile:** Simple layout, logo, fields, submit.
10. **Acceptance:** Leads to dashboard on success.

11. **Dashboard (AR Overview)**

12. **User:** Owner/Operator.

13. **Objective:** Show key metrics.

14. **Components:**

  - Total AR (sum of outstanding).
  - Total overdue % (pie or text).
  - Bar chart or table of aging buckets.
  - Quick stats: this week’s expected cash, broken promises, open disputes.
15. **Data:** Fetched via  GET /dashboard  (or aggregates from invoices).

16. **Actions:** Can click e.g. on “Overdue >30d” to filter invoice list by that bucket.

17. **Empty:** If no invoices, display “No receivables data. Please import invoices.”

18. **Loading:** Show placeholders while fetching.

19. **Invoice Import Page**

20. **User:** Operator.

21. **Objective:** Upload and validate invoice CSV.

22. **Components:**

  - File input or drag-drop area.
  - “Upload” button.
  - If an import is in progress, show progress bar.
23. **Data:** None initially.

24. **Actions:** Select file (CSV only), click Upload.

25. **Loading:** Show spinner or “Processing…” message.

26. **Error:** If file invalid (wrong format), show error “Please upload a valid CSV.”

27. **Empty:** Just empty state with prompt “No import done yet.”

28. **Acceptance:** Transitions to Validation Results.

29. **Import Validation Results Page**

30. **User:** Operator.

31. **Objective:** Show preview of import rows and errors.

32. **Components:**

  - Table listing each row with columns: Invoice#, Debtor, Date, Amount, Status.
  - Green check for valid rows, red X for errors with message.
  - Buttons: “Import Valid Rows”, “Cancel/Start Over”.
33. **Data:** Response from  GET /imports/:id .

34. **Actions:** Operator may fix file offline or proceed with valid rows.

35. **Loading:** Show spinner if needed.

36. **Error:** None (this is showing errors).

37. **Acceptance:** On click “Import Valid Rows”, valid data is committed, and redirect to Invoices list.

38. **Invoice List (Receivables)**

39. **User:** Operator.

40. **Objective:** View all invoices, filter and search.

41. **Components:**

  - Filter panel: Debtor dropdown, Status (Open/Paid/Disputed), Aging bucket, search by invoice number.
  - Table with columns: DueDate, Invoice#, Debtor, Original, Outstanding, Status, Actions.
  - Pagination controls.
42. **Data:** Fetched via  GET /invoices .

43. **Actions:** Click on invoice opens detail; filters adjust query.

44. **Empty:** “No invoices found.”

45. **Loading:** Table skeleton rows.

46. **Acceptance:** Filtering and search work; clicking invoice calls API and opens detail.

47. **Invoice Detail Page**

48. **User:** Operator.

49. **Objective:** Show invoice fields and related tasks.

50. **Components:**

  - Top section: Invoice info (number, dates, amounts, status, outstanding balance).
  - Tabs or sections: “History” (communications and PTP), “Disputes” (if any), “Actions”.
  - Buttons: “Add Communication”, “Add Promise to Pay”, “Add Dispute”, “Record Payment”.
51. **Data:** Fetched via  GET /invoices/:id . Includes communications, promises, disputes.

52. **Actions:** Each button opens a form modal.

53. **Loading:** Show “Loading invoice...” placeholder.

54. **Empty:** Not applicable (one invoice).

55. **Error:** 404 if missing.

56. **Acceptance:** Data matches backend; user can input and save new items.

57. **Debtor List Page**

58. **User:** Operator.

59. **Objective:** List all customers.

60. **Components:**

  - Table: Debtor Name, Code, Total AR, Avg Days Late, Actions (view).
  - Search/filter by name.
61. **Data:** GET /debtors . Possibly aggregate AR (sum).

62. **Actions:** Click name/view icon to open Debtor detail.

63. **Empty:** “No debtors found.”

64. **Loading:** spinner.

65. **Acceptance:** Lists existing debtors.

66. **Debtor Detail Page**

67. **User:** Operator.

68. **Objective:** Show customer summary.

69. **Components:**

  - Debtor info (name, code, phone, email).
  - Stats: Total AR, Overdue %, Last activity.
  - List of all invoices (similar to invoice list but filtered to this customer).
70. **Data:** GET /debtors/:id  with invoices.

71. **Actions:** Filter invoices by status.

72. **Empty:** If no invoices, show “No invoices for this debtor.”

73. **Loading:** placeholder.

74. **Acceptance:** Correct aggregates.

75. **Collection Queue (Tasks)**

76. **User:** Operator.

77. **Objective:** Show tasks due today.

78. **Components:**

  - Table: Invoice#, Debtor, Amount, Aging, Last Contact, Next Task.
  - Each row has “Log Action” button that opens the communication modal.
79. **Data:** GET /collection-tasks .

80. **Actions:** Click row or Log to go to detail.

81. **Empty:** “No tasks for today.”

82. **Acceptance:** Sorted by priority score (we’ll verify a sample order).

83. **Promise-to-Pay View (on Invoice)**

  - **User:** Operator.
  - **Objective:** List of promises for this invoice.
  - **Components:**
  - Table: DueDate, Amount, Status (Active/Due/Broken).
  - “Add Promise” button.
  - **Data:** Fetched on invoice detail.
  - **Actions:** Add promise.
  - **Empty:** “No promises recorded.”
  - **Acceptance:** Status auto-updates by date.
84. **Dispute View (on Invoice)**

  - **User:** Operator.
  - **Objective:** List disputes.
  - **Components:**
  - Table: Category, Notes, Status (Open/Resolved), CreatedDate.
  - “Add Dispute” button.
  - **Data:** On invoice detail.
  - **Actions:** Add/resolve.
  - **Empty:** “No disputes.”
  - **Acceptance:** Resolved disputes display as such.
85. **Payment-Entry Modal/Page**

  - **User:** Operator.
  - **Objective:** Record a payment.
  - **Components:**
  - Fields: Date (default today), Amount, Debtor (autocomplete).
  - After save, show allocation UI.
  - **Data:** None required upfront.
  - **Actions:** Enter details, submit.
  - **Loading:** spinner on submit.
  - **Error:** If no debtor or invalid amount, show message.
  - **Acceptance:** Creates Payment record and navigates to allocation step.
86. **Weekly Report Page/Download**

  - **User:** Operator/Owner.
  - **Objective:** Download summary.
  - **Components:**
  - Date range selector (defaults to last 7 days).
  - “Generate” button.
  - On success, a PDF or table preview.
  - **Data:** Aggregated from invoices/payments.
  - **Actions:** Click Generate.
  - **Loading:** spinner.
  - **Empty:** “No data for selected week.”
  - **Acceptance:** Report data matches dashboard metrics.
87. **Settings/Organization Page**

  - **User:** Owner/Admin.
  - **Objective:** View org settings and user list.
  - **Components:**
  - Organization name, contact.
  - User list with roles; buttons to invite/remove users.
  - **Data:** GET /organizations/me ,  GET /users .
  - **Actions:** Add user, change role.
  - **Acceptance:** Only accessible by Owner.

Each screen prioritizes usability over polish. We use component libraries (shadcn/ui) for tables and forms, and keep a consistent design (e.g. sidebar navigation). The mobile layout can be a simplified vertical stack. All critical flows (importing, tasks, logging, payments) are tested.

## CSV-import design

We define a **canonical CSV template** for invoice import. Columns (headers) we will support (caseinsensitive):

- `customer_code` (optional) – External ID for matching existing debtor.
- `customer_name` (required) – Debtor name.
- `contact_name` (optional) – Name of person (not used in MVP).
- `phone_number` (optional) – (could be ignored or stored).
- email (optional).
- `invoice_number` (required).
- `invoice_date` (required) – Date when invoice was issued.
- `due_date` (required) – Date when payment is due.
- `original_amount` (required) – Invoice total (in IDR).
- `paid_amount` (optional) – Amount already paid (treated as initial payment).
- `outstanding_amount` (optional) – If given, system will verify consistency (ignored if blank).
- salesperson (optional).
- branch (optional) – e.g. city or warehouse code. notes (optional).

**Mandatory columns:** customer_name, invoice_number, invoice_date, due_date, `original_amount`. All others are optional but help.

**Validation rules:**

- `invoice_number` must be non-empty, max length ~50, unique per (Org + Invoice).
- `customer_name` non-empty. If it matches an existing debtor (case-insensitive), link to it; else create new. If  customer_code  is provided, match on code first.
- `invoice_date` and  due_date : accept formats  DD/MM/YYYY ,  YYYY-MM-DD ,  MM/DD/YYYY . `Normalize to Date. If dueDate < invoiceDate, error. If not provided, assume net-30:  due_date = invoice_date + 30 days` (optional fallback).
- `original_amount`: parse Indonesian format e.g. “1.500.000,50” as 1500000.50; also accept “1500000.5” or “1500000”. Must be >= 0.
- `paid_amount`: parse similarly; if > original, error.
- `outstanding_amount`: if provided, check  outstanding = original - paid . If mismatch, error. If blank, compute it as  original - paid .
- Duplicate invoice detection: If an invoice with same number and debtor already exists (status not deleted), flag as duplicate. Error or skip. In MVP, we *skip duplicates* and list them in errors.

**Normalization:** Trim whitespace; uppercase codes; date parse; number parse (remove currency symbol, thousand sep).

**Error handling:**

- Missing required field: “Missing [field]”.
- Bad format: “Invalid date format in due_date” or “Amount not numeric”.
- Duplicate: “Invoice number already exists for this customer”.
- Inconsistent amounts: “Paid amount exceeds original”.
- Too long: “Invoice number too long (max 50)”.

**Preview behavior:** The import preview page will show each row with either a green “OK” or red error icon and message. Valid rows listed for import, invalid rows listed separately.

**Example valid row:**

```
CUSTOMER_CODE,CUSTOMER_NAME,INVOICE_NUMBER,INVOICE_DATE,DUE_DATE,ORIGINAL_AMOUNT,PAID_AMOUNT
CUST-001,PT Surya Sentosa,INV-2023-001,01/06/2026,30/06/2026,"1.250.000.000",0
```

**Example invalid row:** (missing due date)

```
,Cemara Utama,INV-2023-050,15/06/2026,,500000000
```

Error: Missing due_date

We will hardcode the template columns in code and reject any unknown columns.

## Project and folder structure

Given the 14-day timeline, a **monorepo** is recommended (faster to set up and CI). We can use a packages/ structure or just  app/frontend  and  app/backend  in one repo. For simplicity, one repo with folders:

```text
/ (repo root)
├── README.md
├── package.json
├── tsconfig.json
├── prisma/             # Prisma schema & migrations
│   ├── schema.prisma
│   └── migrations/
├── backend/            # Node + Express API
│   ├── src/
│   │   ├── server.ts
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── models/      # (Domain logic)
│   │   ├── middlewares/
│   │   └── routes.ts
│   └── package.json
├── frontend/           # Next.js app
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── api-client/     # wrappers for fetch/axios to our API
│   ├── styles/
│   └── package.json
├── prisma/             # (duplication? keep under root)
│   └── schema.prisma
├── tests/              # Integration/E2E tests
│   ├── integration/
│   └── e2e/
└── scripts/
    ├── seed.ts        # seed data script
    └── backup.ts
```

Alternatively, a single codebase without separation is possible, but with Next.js API routes the backend could live in the same Next project. However, to fit the stack choice (Express + Next), we'll keep separate. We use relative imports for shared types (like user, invoice).

**Folder notes:**

- `backend/src/controllers/` – define Express route handlers (e.g. InvoiceController).
- `backend/src/services/` – business logic (e.g. AgingService, ImportService).
- `backend/src/repositories/` – Prisma queries (InvoiceRepo with Prisma client).
- `backend/src/models/` – domain types (if needed).
- `backend/src/middlewares/` – e.g. auth checking, error handling.
- `backend/src/routes.ts` – wire controllers to endpoints, include auth middleware.
- `frontend/components/` – UI components (tables, forms, modals).
- `frontend/pages/` – Next.js pages (Login, Dashboard, Invoices, Debtors, etc).
- `frontend/api-client/` – axios or fetch wrappers for each API (organized by domain).

We will use shared types in TypeScript by maybe a  @types  package or by copying interfaces.

This structure is minimal but clear. We prioritize MVP over perfect architecture (no microservices, no heavy abstractions).

## Authentication and multi-tenancy

For quick implementation, **NextAuth.js** (for frontend Next) is possible, but since we use a separate Express backend, we might use **JWT** with a library (like  jsonwebtoken ). Given time constraints, a custom JWT auth is fastest:

- **Login flow:** On POST /auth/login, if credentials match (hashed in DB), issue a JWT that includes `{userId, orgId}`.
- **Token store:** Use HTTP-only cookies or Bearer token. For simplicity, return token and frontend stores in memory (or localStorage with caution).
- **Middleware:** On each backend request, decode token, attach  req.user = {id, orgId, role} . Reject if token expired or missing.
- **Session expiration:** Set JWT expiry (e.g. 1 day). Frontend should handle re-login.

**Multi-tenancy enforcement:**

- Every data table has  organizationId . We never accept orgId from client. Instead, for each request, after decoding JWT, we know currentOrgId. All repository queries include  where: `{ organizationId: currentOrgId, ... }`.
- `Example:  invoiceRepo.findMany({ where: { organizationId: req.user.orgId, ...filters } })`.
- We write a repository base class or ensure in each query.
- For upload or creation, automatically set  orgId = req.user.orgId .

**Access control:**

- Only Owner can invite new users (we check  req.user.role === 'OWNER' ).
- Regular user can do everything else (we have only one org admin role for MVP).

**Security rules:**

- Never trust the frontend for orgId.
- In tests, include a case where user tries to access another org (should get 404 or 403).

By day 14, a minimal JWT auth with middleware and role check is enough. We will **not use a third-party** **auth** due to time/cost.

## Security requirements

Given a controlled pilot, we implement essential security:

**Before Demo (Day 14 MVP):**

- HTTPS enforced (on production deploy via Vercel).
- Passwords hashed (bcrypt).
- JWT stored securely (httpOnly cookie or localStorage; for MVP we’ll accept localStorage).
- Input validation to prevent injection (we use Prisma ORM, so SQL injection is mitigated if used properly). Still validate all input (especially file parsing).
- Rate limit login attempts (simple check of 5 attempts per hour in memory or skip if too complex).
- Environment variables for secrets (we list them in deploy instructions).

**Before Client Data:**

- Use random, long JWT secret.
- Audit logs enabled.
- Server error responses should not leak stack traces (generic error message).
- All endpoints require auth (except login).
- File upload: only accept  .csv , limit size (e.g. 5 MB).
- XSS/CSRF: With REST + token auth, CSRF is low risk; for safety, set sameSite=lax on cookies if used.
- Sanitization: escape or strip dangerous chars in logs.

**After 3 Clients (future):**

- Add MFA (Time-based) for login.
- Implement full OWASP Top 10 checks (SQLi, XSS, etc).
- Strict CORS (only allowed origins).
- Rate limiting on critical endpoints.

**Not necessary for initial 14-day MVP:**

- WAF, IPS, compliance audits.
- Full GDPR/PDPA compliance (though we should mention data deletion on request).
- Penetration testing.

All security measures are documented in the FAQ/limitations: for instance, clarify that user should not use production financial accounts for initial testing.

## Testing strategy

We adopt a practical testing plan:

**A. Unit tests (Vitest):** Focus on pure logic functions:

- Aging calculation (e.g. given dates, returns correct bucket).
- Outstanding balance (with partial payments).
- Priority scoring formula outputs ordering.
- PTP detection logic (due vs broken).
- Duplicate detection (simulate sets of invoice numbers).
- CSV normalization (date and rupiah parsing functions).
- Business rules for due-soon classification.

**B. Integration tests (Jest + Supertest):**

- Repository methods: e.g.  InvoiceRepo.createInvoice  and  InvoiceRepo.find .
- Service workflows: e.g.  ImportService.processCSV()  should insert correct records.
- Auth middleware: ensure an API cannot be accessed without token or with invalid token.
- Tenant scoping: Attempt to access Org B data with Org A’s token (should 403/404).
- CSV import end-to-end: call POST /imports and verify DB state.
- Payment allocation logic: creating payment and allocations changes balances correctly.
- Report generation: calling GET /reports returns correct summary from seeded data.

**C. End-to-End (Playwright):** Simulate the actual UI flows:

- **Login** and see dashboard.
- **Upload valid and invalid CSV**, ensure errors show.
- **View aging**: after import, check a known overdue invoice is in bucket “31-60”.
- **Record a promise and mark it broken** by advancing date.
- **Create a dispute** and see invoice status.
- **Record payment and allocation**, then confirm invoice status changes to Paid.
- **Generate report** and check key values.

We will script a Playwright test using the seeded demo data.

**D. Security tests:**

- Attempt cross-org access: with org A’s JWT, GET /invoices/:id for org B’s invoice (should 404).
- Unauthenticated request to protected API (should 401).
- Invalid JWT (tampered) should be rejected.
- Upload wrong file type (e.g. .exe) to import (should 400).
- Try duplicate user signup/email.

**E. Data Quality tests:**

- Import CSV with invalid date formats, ensure proper errors.
- Import with missing required column header (reject).
- Negative invoice amount (reject).
- Invoice due before issue date (reject).
- Over-allocation: try to allocate a payment beyond its amount (fail).
- Duplicate payment allocations to same invoice (should be prevented or rejected).

**F. Manual UAT checklist:** We prepare a checklist for the founder and one finance-savvy user to go through, including all critical flows. Each item:
| Test Name | Preconditions | Steps | Expected Result | Severity | Block? |
| --- | --- | --- | --- | --- | --- |
| Login Screen | App deployed | Enter valid creds, click Login | Dashboard appears | High | Yes |
| Invalid Login | App deployed | Enter wrong creds | Error “Invalid credentials” | Medium | No |
| Import Valid CSV | User logged in | Upload valid CSV with 10 invoices | Success; 10 invoices appear in list | High | Yes |
| Import Invalid CSV | User logged in | Upload CSV missing required column | Show error message listing missing columns | High | Yes |
| View Aging Buckets | Invoices imported | Go to Dashboard | Aging chart shows buckets matching data | Medium | No |
| Task Queue Order | Some overdue invoices | Go to Collection Queue | Invoices sorted by priority (check top vs bottom) | Medium | No |
| Log Follow-up | Open invoice | Add communication note via UI | Communication appears under invoice history | High | Yes |
| Record Promise & Break | Customer promised yesterday | Create promise for past date (simulate) | Marked as Broken after “today” | Medium | No |
| Add Dispute | Open invoice | Add a dispute category and note | Invoice shows “Disputed” flag | Medium | No |
| Record Payment & Allocation | Open invoice with O/S >0 | Create payment and allocate to invoice | Invoice outstanding 0, status Paid | High | Yes |
| Weekly Report Content | Data modified | Generate weekly report | Contains correct summary numbers | Medium | No |
| Multi-Org Access | Two orgs (seed data) | Try to access Org B data with Org A token | Request denied (404 or 403) | High | Yes |

(Each test will be documented with ID and run results.)

Coverage targets: Aim for 80% on key logic (aging, allocations) and 100% on the simple formulas. We will not require 100% on boilerplate (like 404 response messages).

## Detailed test cases

Below are illustrative test cases for critical flows. Each has: precondition, steps, expected, and severity/ blocking.

1. **Duplicate invoice import**
2. *Pre:* Org has invoice INV-001 for debtor X.
3. *Steps:* Import CSV with a row having invoice_number=INV-001, customer_name=X.
4. *Expected:* Import logs an error “Duplicate invoice”; original remains unchanged; no crash.
5. *Severity:* Medium (must not allow silent duplicates).
6. **Incorrect aging calculation**
7. *Pre:* Today = 2026-07-13. Invoice due_date=2026-07-10.
8. *Steps:* Fetch invoice, inspect  agingBucket .
9. *Expected:* daysOverdue=3, bucket “1-7”.
10. *Severity:* High.

11. **Cross-tenant data access**

12. *Pre:* Org A and Org B exist with invoices.

13. *Steps:* Using Org A’s JWT, request  GET /invoices/{id_of_orgB_invoice} .

14. *Expected:* 404 Not Found (or 403) – Org A cannot see Org B data.

15. *Severity:* High, blocks.

16. **Partial payment allocation**

17. *Pre:* Invoice INV-100 original 1000, outstanding 1000. Payment of 600.

18. *Steps:* Allocate 600 to INV-100.

19. *Expected:* INV-100 outstanding=400; status=PartiallyPaid. Payment remaining=0.

20. *Severity:* High.

21. **Broken promise detection**

22. *Pre:* Promise entered for invoice of 500k due on 2026-07-10; today is 2026-07-13 and no payment.

23. *Steps:* System cron or manual check trigger.

24. *Expected:* Promise status changed to “Broken”. Invoice flagged with broken promise note.

25. *Severity:* Medium.

26. **Dispute blocks follow-ups**

27. *Pre:* Invoice INV-200 is overdue 15 days. Operator adds Dispute (Missing POD).

28. *Steps:* Generate tasks.

29. *Expected:* INV-200 is *not* in today’s task queue (since it’s disputed).

30. *Severity:* Low (more UX).

31. **Failed email sending (not implemented)**

32. *Pre:* Email integration is not in MVP.

33. *Steps:* Attempt to send via system.

34. *Expected:* The “Email” button is disabled/hidden, or error “Not implemented”.

35. *Severity:* Low.

36. **Ambiguous bank-statement matching**

37. *Pre:* Payment has no invoice number.

38. *Steps:* Allocate payment to invoice with similar amount.

39. *Expected:* UI shows possible matches; operator manually confirms.

40. *Severity:* Low (manual fix).

41. **Deleted user access**

42. *Pre:* User A (admin) deletes user B.

43. *Steps:* User B’s token tries any request.

44. *Expected:* 401 Unauthorized (user is deactivated).

45. *Severity:* Medium.

46. **Invalid document upload**

  - *Pre:* Disallowed file (e.g. .exe) to import.
  - *Steps:* Try to upload.
  - *Expected:* 415 Unsupported Media Type or 400 error message.
  - *Severity:* Low.

These cover most pain points.

## Seed and demo data

We will create a realistic dataset for “PT Bumi Makmur Abadi”, a building-material distributor in Surabaya. The data will be in Indonesian language context (company names, rupiah).

**Organization:**

- Org ID 1: “PT Bumi Makmur Abadi” (Owner user: demo@bumi.id).

**Users (seeded):**

- User 1:  demo@bumi.id , role=OWNER.
- User 2:  staff1@bumi.id , role=USER.
- User 3:  staff2@bumi.id , role=USER.

**Debtors (15 examples):** *(names in Indonesian context)* 1. PT Tiga Industri 2. PT Sinar Makmur 3. CV Mega Sentosa 4. UD Maju Jaya 5. PT Cipta Beton 6. PT Alat Berat Mandiri 7. PT Sumber Alam 8. CV Cahaya Renovasi 9. UD Karya Teknik 10. PT Bumi Semesta 11. PT Prima Konstruksi 12. CV Empat Pilar 13. PT Mitra Teguh 14. PT Graha Abadi 15. UD Sukses Jaya

Each has a  customer_code  like “CUST01” etc., phone numbers (e.g. “0812-XXXX”), and contact person.

**Invoices (80 total, mix of statuses):** Values range from Rp 10 million to Rp 500 million. Terms usually 30 days. We distribute:

- ~20 invoices currently NotDue (due in future).
- ~20 invoices overdue 1–7 days.
- ~20 invoices overdue 8–30 days.
- ~10 invoices overdue 31–60 days.
- ~10 invoices >60 days.

Include partial payments and promises:

Examples (format [Debtor, Inv#, Issue Date, Due Date, Original, Outstanding]):

- PT Tiga Industri, INV-23001, 2026-06-10, 2026-07-10, Rp 150,000,000, Outstanding Rp 150,000,000. (Overdue 3 days)
- PT Tiga Industri, INV-23015, 2026-05-01, 2026-05-31, Rp 200,000,000, Outstanding Rp 80,000,000. (Paid Rp120M, partial)
- PT Sinar Makmur, INV-23002, 2026-06-05, 2026-06-20, Rp 75,000,000, Outstanding 75M (overdue 23d). Promise: Rp 30M on 2026-07-15.
- PT Sinar Makmur, INV-23016, 2026-04-01, 2026-04-30, Rp 300,000,000, Outstanding 300M (overdue 74d). Broken promise: Rp 100M on 2026-05-15 (unpaid).
- CV Mega Sentosa, INV-23003, 2026-07-01, 2026-07-30, Rp 50,000,000, Outstanding 50M (not due yet).
- UD Maju Jaya, INV-23004, 2026-06-15, 2026-07-15, Rp 125,000,000, Outstanding 125M (due soon, 2 days left).
- PT Cipta Beton, INV-23005, 2026-05-20, 2026-06-19, Rp 220,000,000, Outstanding 0 (Fully Paid on time).
- PT Alat Berat Mandiri, INV-23006, 2026-06-01, 2026-06-30, Rp 90,000,000, Outstanding 90M (overdue 13d). Dispute: “Wrong quantity” open.
- ... (and so on for others).

Include for each: some have  communicationLogs ,  promises , or  disputes  in seed data:

- A few  Communication  entries like: “2026-07-08: Called, said waiting internal approval (user staff1)”.
- Some  PromiseToPay : e.g. PT Sinar Makmur made a promise on 7/1.
- Some  Dispute : e.g. PT Alat Berat Mandiri dispute “Missing POD” created 2026-07-05.

**Payments:** Some payments are allocated:

- Payment id 1: 2026-06-20, amount 120M from PT Cipta Beton, allocated fully to INV-23005.
- Payment id 2: 2026-06-25, amount 30M from PT Sinar Makmur, allocated to INV-23002 (partial).
- Payment id 3: 2026-07-10, 50M from CV Mega Sentosa (unallocated, since INV-23003 not due).
- Payment id 4: 2026-07-12, 80M from PT Tiga Industri, allocated to INV-23015 (remaining 80M).

This seed covers edge cases: partial, paid, broken, disputed, etc. Use Indonesian rupiah formatting in display (Rp prefix).

We will load this via a script into the dev DB, and ensure the demo flows (as in part 2) can run seamlessly with these data.

## Infrastructure and deployment

**Frontend:** Deploy on Vercel (free Hobby tier) 【3†L229-L237】. **Backend:** Node API on a small host: possibilities include Railway (free tier), Heroku (free), or Fly.io (small). For minimal cost, we can also host the API on Vercel as Serverless Functions (for Express, need to adapt), but recommended: use Railway’s free plan (1 container 500h/mo). **Database:** Use a managed PostgreSQL with a free tier: e.g. Supabase (free 500 MB) or Neon (free 10M rows). We can also use Heroku Postgres free (with monthly limit). We'll pick Supabase (Indonesia region not needed, data is small). **File storage:** If we skip document upload, not needed. If needed, could use AWS S3 Free Tier or Vercel’s built-in storage. In MVP, no persistent doc storage. **Error monitoring:** Set up Sentry (free tier) or simply rely on Vercel/Railway logs. Sentry might be too heavy for MVP. **Uptime monitoring:** Use a simple service like UptimeRobot (free for 50 checks). **Domain:** Buy a simple domain (like rp15,000/month). Or use no-brand. If budget prohibits, use Vercel's default URL. **Email:** For any notifications, a free-tier email (SendGrid free) or skip for now.

**Dev/Staging/Prod:**

- Development on local (with environment  .env.dev ).
- Use main branch for production, and optionally a staging branch. But with limited users, staging can be local or test project.

**Migration:** Use  prisma migrate dev  to create schema. On deploy, run  prisma migrate deploy . **Seeding:** Use  ts-node prisma/seed.ts  after migration to create demo org, users, data. **Backup:** Configure daily dump: e.g.  cron: pg_dump  to file and store off-host (like Git LFS or Google Drive). For Supabase, use their automated backups.

**Rollback:** In case of bad deploy: Vercel and Railway offer instant rollback to previous deployment. Database rollback: keep SQL dump from last migration if needed.

**Infrastructure costs (approx):**

- Vercel: $0 (Hobby plan)【3†L229-L237】.
- Railway Free: $0 up to 500h (~3 weeks).
- Supabase Free: $0 (limited to 500 MB, which is fine).
- Domain: ~Rp150k/year (optional).
- Monitoring: $0.
- **First-month total:** ~Rp0–10k (if only domain).
- **After 3 clients:** Possibly upgrade to $20–40/mo for more Dyno hours if needed; but for first 10 customers, still free tier is likely enough if usage is low.

ENV variables needed:

`DATABASE_URL JWT_SECRET NEXTAUTH_SECRET (if using NextAuth for front)`

Deployment steps (automated via GitHub Actions on push to main):

- Backend: Deploy to Railway (or Vercel Functions). Use a small Node process.
- Frontend: Deploy to Vercel (connect GitHub, auto on push).
- Both will run  prisma migrate deploy  on startup.

Smoke tests: After deployment, run a script that logs in (via API) and checks  /health  or  /dashboard .

## CI/CD

A minimal GitHub Actions workflow:

name: CI

on: push: branches: [ main, dev ] `pull_request:` branches: [ main ]

jobs: build-and-test: runs-on: ubuntu-latest steps: `- uses: actions/checkout@v3 - name: Setup Node.js uses: actions/setup-node@v3` with: node-version: 18 - name: Install dependencies run: npm install - name: Lint & Typecheck run: npm run lint && npm run type-check - name: Run Unit & Integration tests run: npm test - name: Build frontend run: npm run build - name: Run migrations run: npx prisma migrate deploy - name: Integration Test (API) run: npm run test:integration # We skip E2E here (too slow); E2E done locally or separate.

- **PR rules:** All tests must pass. Code review mandatory.
- **Merge to main:** Triggers deployment (could use Railway/GH integration or manual).
- **Secrets:** Store DB URL and JWT secret in GitHub secrets.

No deployment on fork builds for security.

## Logging and monitoring

**Logging:**

- Use structured logs ( console.log  with JSON or bunyan/pino) in backend. Include request IDs and user info.
- Log levels: info for normal actions (imports, payments), warn for recoverable issues, error for exceptions.
- Store logs via Railway or Vercel (they aggregate stdout).

**Request IDs:** Use a simple middleware to tag each incoming request with a UUID. Attach this ID to logs and response headers (e.g.  X-Request-ID ).

**Error monitoring:**

- Integrate Sentry’s free tier (or BugSnag) to capture uncaught errors. We'll note to add  SENTRY_DSN if set.
- For MVP, rely on console and Vercel error reporting.

**Failed-import/jog:** In import flow, catch parsing errors and report to UI and log them.

**Audit logging:** Implement as above; we can expose an endpoint to download (for admins).

**Alerts:** Founder should receive email or Slack for critical failures: e.g., “database connection failed” or “import job crashed”. This can be a simple webhook to Slack using Node.

**Uptime:** Use UptimeRobot to ping  /health  every 5 minutes.

**Monitoring DB:** On Supabase, basic metrics provided. No custom needed for early stage.

## Backup and recovery

- **Database backups:** Enable automated daily backups on Supabase (they offer point-in-time recovery for 7 days on free). Also, once a week run a manual  pg_dump  and store file in a private GitHub Repo or Drive.
- **Schema migrations:** Prisma keeps migration history in repo. We can rollback by migrating down (risky if data present).
- **File backup:** (Not needed unless document upload is used later).
- **Restore test:** After migration and seeding, do a test restore from backup dump into a new DB instance to ensure the process works.
- **Accidental deletion:** We use soft-delete (e.g.  isDeleted  flag) on critical tables (Invoice, Debtor). Actually deleting would be admin action.
- **Import rollback:** If an import is clearly wrong, we record import job ID on all its invoices. Provide a “Revert Import” action that deletes all invoices associated with that job (if no payments applied). This can be a background script or endpoint.

**Incident checklist:** 1. Identify issue (app error, data corruption, downtime). 2. If code error: fix quickly and redeploy with rollback if needed. 3. If data loss: restore last known good state from backup dump. 4. If DB down: restart service, or if irrecoverable, import from last backup (downtime acceptable for small clients).

Before client data goes live, we **test restoration** from a backup on a throw-away database.

## Sales-readiness assets

To convince prospects, the following must be ready:

- **Production URL:** e.g.  https://ar-collections.mycompany.com . (We can use a free domain from Vercel, but a custom looks more professional.)
- **Landing page:** A simple Next.js page explaining the service (“Outsource your B2B collections, get paid faster” in Bahasa Indonesia). Include key benefits and features list.
- **Demo login:** A public demo account (e.g.  demo@company.com / DemoPass123 ) on a seeded org, with a quick link.
- **Sample dashboard:** Realistic screenshot or live demo showing numbers (from seed).
- **Sample weekly report:** A templated PDF (we can generate one from seed data) named “Week_InvoiceReport.pdf”.
- **Sample CSV template:** A downloadable  template_invoices.csv  with headers and one example row.
- **One-page product explainer:** Summary of “What we do, how it works, benefits” (in Indonesian), possibly as PDF.
- **Data-security summary:** A bullet list explaining we use HTTPS, data is isolated per client, no data is shared, NDA for operators (pointing to pilot agreement).
- **Pilot onboarding checklist:** Steps the client takes to start (see next section).
- **FAQ:** Anticipate questions: “How do you contact our customers?”, “How do you charge?”, “What data do you need?”, etc., with brief answers.
- **Known limitations:** List what the system does NOT do (no automated calls, no credit extension, no legal recovery).
- **Demonstration script:** (Below) exact narrative to follow in demo.
- **Demo video/screenshots:** 3-5 minute screencast of the above flows (optional, but helpful for remote prospects).
- **Pilot proposal template:** A short doc outlining scope (e.g. 2-week pilot for X invoices, price, deliverables).

**Demonstration script (7-12 min):** The flow outlined in Product Demo (see Part 2) will be used. We will prepare bullet talking points for each step (especially highlighting value: e.g. “Note how this app shows Mr. Owner exactly which invoices need attention and when cash will come in. We don’t just send random reminders.”). Also prepare to answer likely questions (in Buyer Mapping sections).

**Questions to ask prospect during demo:**

- “How many invoices do you typically have per month? Over how many days?” (to calibrate scale)
- “How do you currently track promises to pay?”
- “What happens when a payment promise is missed?”
- “Who currently does collections? Owner, AR staff, sales?”
- “What tools do you use (Excel, ERP)?”
- “What’s the biggest pain – old invoices, missed docs, or customer disputes?”
- “Would owner or manager like a weekly summary?”

**CTA at end of demo:** 1. Offer **Free AR Diagnostic**: “Send us your invoice aging data; we’ll analyze and show you the gaps.” (No

strings, short report). 2. Offer **Two-week Paid Pilot** at a fixed fee (e.g. Rp3,000,000) for managing up to X invoices. 3. Or schedule follow-up: “Let’s schedule a call after you consult with your team, maybe early next week.”

## Client-pilot checklist

Before running a pilot, ensure:

- **Signed Service Agreement:** Clarify scope, confidentiality, non-compete.
- **Data-Processing Consent:** Written consent to handle their data (email/WhatsApp communications with their customers).
- **Designated Users:** Who is our contact (Owner, Finance Manager). They must agree to share data.
- **Data Limitations:** We only use invoice/AR data for agreed scope.
- **Communication Boundaries:** Define approved channels and tones; e.g. we will never threaten legal action, only polite reminders.
- **Data Transfer:** Client provides invoice export via secure channel (e.g. email, Google Drive link).
- **Environment Setup:** We use our own software and tools.
- **Scope Definition:** Number of invoices or accounts covered, pilot duration (e.g. 2 weeks on 100 overdue invoices).
- **Success Metric:** E.g. reduce average days outstanding by X, or get Y amount paid.
- **Data Deletion Plan:** After pilot, all data either handed back or deleted.

**Pilot onboarding steps:** 1. Sign agreement. 2. Client prepares and sends latest open-invoice CSV. 3. Founder uploads it, reviews with client (data cleanup if needed). 4. Confirm communication plan (which customers to contact, who sends message). 5. Launch collection operations (start sending out reminders). 6. Weekly sync call to review progress. 7. End pilot: deliver final report, reconcile payments, delete data.

## 14-day execution roadmap

A precise day-by-day plan:

**Day 1: Scope freeze & setup (6–8 hrs)**

- Finalize P0 scope.
- Set up Git repo, install Node/Next/Express.
- Basic architecture: create folders and initial files (see structure).
- Write high-level ER diagram and draft Prisma schema (skip details).
- Skeleton wireframes (hand-drawn or figma) for key screens.
- Initialize Vercel and Railway projects.
- **Done:** Repo with placeholder structure, tasks list.
- **Risk:** Over-architecting; fallback: cut any non-critical module.

**Day 2: DB & auth foundation (6–8 hrs)**

- Complete Prisma schema (Organization, User, Membership).
- Run first migration.
- Seed script: add demo org and users.
- Implement  POST /auth/login  and password hashing.
- Middleware for JWT and role.
- Test login flow manually (also write basic integration test).
- **Done:** Able to create user in DB and get token.
- **Risk:** If auth fails, lean on simple session or skip JWT (very unlikely).

**Day 3: Debtor & Invoice basic (6–8 hrs)**

- Add Debtor model and migration.
- Create repositories and controllers: GET/POST debtors.
- Add Invoice model (invoiceNumber, dates, amounts).
- Routes: GET /invoices, GET /invoices/:id, POST (optional).
- Simple invoice list page (no import yet): show empty state.
- Multi-tenancy test: attempt GET /debtors without orgId (should fail).
- **Done:** Can CRUD debtors, view invoice list (empty).
- **Risk:** If running out of time, skip optional POST invoice (customers will use CSV anyway).

**Day 4: CSV import (8–10 hrs)**

- File upload endpoint (multipart) and parsing (use  csv-parser  or Papa).
- Validation logic: required fields, format.
- Build preview UI: display row errors.
- If valid, insert debtors (upsert by code/name) and invoices.
- Update invoice.outstanding=original if paid_amount provided.
- Error report generation (list of row errors).
- Integration test: simulate CSV upload with valid and invalid lines.
- **Done:** Importing invoices with errors flagged works.
- **Risk:** If parser complicated, fallback to line-by-line simple string split (less robust).

**Day 5: Aging & dashboard (6–8 hrs)**

- Implement background job or on-the-fly aging calculation in InvoiceRepo or query.
- Query invoices to compute aging buckets.
- Build Dashboard API ( GET /dashboard ) returning totals by bucket, overdue%.
- UI: Dashboard page showing metrics and chart (use chart lib or simple table).
- Add filters on invoice list (by bucket, debtor).
- Unit test: aging function on sample dates.
- **Done:** Dashboard shows realistic values from demo data.
- **Risk:** If charting is tough, use text counters or a simple bar using Tailwind.

**Day 6: Collection queue (6–8 hrs)**

- Implement priority scoring in service.
- Endpoint  GET /collection-tasks : returns top N invoices with needed follow-up.
- UI: Collection Tasks page listing these invoices.
- Manual override: allow dragging to reorder (or a simple “mark done” button on each).
- Test: ensure highest overdue appear first.
- **Done:** Task queue sorted and clickable.
- **Risk:** If time-bound, skip drag-reorder; use simple order and manual marking.

**Day 7: Communication logging (6–8 hrs)**

- Communication model and migration.
- API: POST /communications, GET /invoices/:id/communications.
- UI: On invoice detail, list communications and “Add” form.
- “WhatsApp” click-to-chat link: use  https://wa.me/{{phone}}?text={{message}} .
- Templates: Pre-fill message body with invoice details via UI.
- **Done:** Can log new comms and see history.
- **Risk:** If stuck on WhatsApp link, just log free-text note with channel.

**Day 8: Promise & Dispute (6–8 hrs)**

- PromiseToPay model & migration.
- POST /promises, GET /invoices/:id/promises. Auto-calc broken in service.
- UI: On invoice detail, “Promises” tab shows list, allows adding.
- Dispute model, POST /disputes, GET /invoices/:id/disputes.
- UI: “Disputes” tab, similar.
- When PTP added or broken, update invoice flag (colored label).
- **Done:** PTPs and disputes can be added/seen.
- **Risk:** If time low, combine PTP and dispute into one “Note” UI (worse UX).

**Day 9: Payments (6–8 hrs)**

- Payment model & migration.
- POST /payments, GET /payments, GET /invoices/:id/payments (if needed).
- Allocation endpoint and logic.
- UI: Payment entry form, allocation form. Possibly in one invoice page (e.g. “Add Payment” on invoice).
- Update invoice.outstanding = original – sum(allocations).
- Partial: If payment < outstanding, invoice remains open.
- **Done:** Payment recording and allocation works; invoice closed when fully paid.
- **Risk:** If stuck on partial allocation UI, implement single allocate to one invoice (skip multi-allocate).

**Day 10: Reports & seed/demo data (6–8 hrs)**

- Implement GET /reports/weekly logic (simple DB queries).
- UI: Weekly Report page with generate button and table. Or just generate on server and email/PDF (if time, do table with export).
- Write seed.ts to add demo org, users, debtors, invoices, promises, disputes, payments as per plan.
- Run seed on local, verify with UI.
- Collect screenshots or PDFs from the app for demo usage.
- **Done:** Demo dataset loaded and accessible. Reports functioning.
- **Risk:** If no time, skip PDF output; present report in-browser table.

**Day 11: Integration/E2E testing (6–8 hrs)**

- Write integration tests for all major APIs (auth, import, invoice CRUD, allocation).
- Write Playwright tests for key UI flows (login, import, record payment).
- Write tenant-isolation test: in Node, try to create two orgs and ensure cross access fails.
- Address any failures.
- **Done:** Tests passing. Automate them in CI.
- **Risk:** If test coverage incomplete, ensure at least manual steps are stable.

**Day 12: Security & backups (4–6 hrs)**

- Review code for unvalidated inputs. Fix any found.
- Set up HTTPS in production (Vercel does automatically).
- Add reminders to use secure JWT secret, strong passwords (in docs).
- Write simple backup script (prisma/backup.ts using  pg_dump ) and test it.
- Deploy to staging environment (branch or preview), run smoke tests (login, get data).
- **Done:** Security review checklist (no obvious holes). Backup tested.
- **Risk:** If time short, at least ensure no secrets in code, explain manual backups.

**Day 13: Production deploy & sales materials (2–4 hrs)**

- Merge to main, let CI deploy to production.
- Assign domain (if available).
- Create demo user and share login link.
- Collect screenshots, finalize landing page copy.
- Draft one-pager and pilot contract template (basic text).
- Prepare final checklist of limitations to share (e.g. “We require an email at each step”).
- **Done:** System live at public URL, marketing materials assembled.
- **Risk:** If anything breaks on prod, use rollback (CI logs). Domain can be optional (use Vercel default).

**Day 14: Final acceptance & rehearsal (2–4 hrs)**

- Perform full UAT with seed data (following the checklist above).
- Fix any high-severity bugs discovered.
- Rehearse demo script with the actual demo account.
- Confirm all required Day-14 outputs (demo account, scripts, FAQs) are ready.
- **Done:** Founder confident to demo and contact clients.
- **Risk:** If issues remain, document them (known limitations) but ensure the core demo path works.

**Parallel tasks:** While some days focus on dev, concurrently allocate a few hours each day for outreach (calls, emails) to start lining up interviews or prospects. But coding is main priority.

**Critical path:** The import and core invoice/aging logic (Days 3–6) is most critical; if behind, cut optional screens (Contacts, complex filters) first. Ensure logging and testing (Days 11–12) are done rather than new features.

## Cut-scope plan

If we fall behind, we define:

- **Full 14-day MVP:** All P0 features above.
- **Reduced MVP:** Still usable for AR diagnostic. We would cut: *Audit logs UI*, *optional filters*, *export* *features*. Possibly allow manual CSV data editing instead of complex import preview (as temp fix).
- **Emergency MVP (minimum):**
- Authentication (could simplify: single demo user hard-coded).
- Org with built-in demo data (no import UI; data seeded).
- Invoices list and detail (seeded data only).
- Manual tasks page (maybe static).
- Logging communication (maybe just via notes field on invoice).
- No promises/disputes UI (skip, just note them in communications).
- Payment recording optional (we can mark invoices as “collected” manually).
- Demo script will have to skip a few steps: e.g. say “This system would allow import, but we do it for you.”

Even the emergency version should show:

- A list of overdue invoices (from seed).
- Ability to mark them contacted (maybe just a checkbox).
- At least a static or manual report summary (e.g., “Rp 150M collected”).

This emergency MVP would allow a conversation but lacks real functionality. It’s truly a last resort.

## Day-14 definition of done

The MVP is complete when **all** of the following are true:

- **Deployed and accessible:** The app is live at the production URL. *(Pass: URL loads login page.)*
- **Authentication works:** Able to log in/out. *(Pass: login with demo user.)*
- **Tenant isolation tested:** Org A cannot see Org B data. *(Pass: cross-org test 404s.)*
- **Seed data loaded:** The demo company with invoices is present. *(Pass: Debtor count 15, invoice count* *80.)*
- **CSV import works:** Can upload and commit a valid CSV. *(Pass: sample CSV imports successfully.)*
- **Invalid rows visible:** Errors are shown for bad CSV data. *(Pass: upload invalid CSV shows errors.)*
- **Aging correct:** Invoices are in correct buckets. *(Pass: known invoice due dates map to expected bucket.)*
- **Tasks generated:** Collection queue shows expected invoices. *(Pass: At least one invoice appears.)*
- **Communications recordable:** Can add and see new follow-up entries. *(Pass: add note, refresh, see it.)*
- **Promises trackable:** Can create a PTP and mark it broken automatically. *(Pass: add PTP with past* *date, see “Broken”.)*
- **Disputes trackable:** Can create a dispute and see “Disputed” flag. *(Pass: add dispute, see flag.)*
- **Payments allocatable:** Record a payment and apply to invoice; balances update. *(Pass: invoice* *balance reduces.)*
- **Partial payments:** Allocate partial, invoice remains partially open. *(Pass: allocate part, remaining* *shown.)*
- **Reports generatable:** Weekly report can be produced and data matches UI. *(Pass: generate, check* *numbers.)*
- **Key tests pass:** Automated tests (unit, integration) all green. E2E passes on core flows. *(Pass: CI* *status green.)*
- **Backup works:** Can run backup script and restore to a fresh DB. *(Pass: dump and restore result in* *identical data.)*
- **Demoable:** Founder can run through demo in under 12 minutes without errors. *(Pass: dry-run of* *script OK.)*
- **Known limitations documented:** A list of missing features and risks is written. *(Pass: included in* *README or FAQ.)*

Any failure in a high-severity item (import, auth, tenant security) is a blocker. Lower severity items (like basic styling) can be marked as limitations.

## Post-MVP roadmap

**Days 15–30 (Refine & stabilize):**

- **Collect client feedback:** Run 3-5 customer interviews or pilot tests. Adjust workflows based on reality (maybe disputes are more complex than thought).
- **Improve data cleaning:** Add fuzzy matching for debtors, allow editing imported invoices.
- **Enhance UI:** Fix any usability issues from testing. Add pagination to lists if needed.
- **Build lean client portal (if requested):** A read-only dashboard (light).
- **Strengthen security:** Add 2FA, fix any security gaps discovered.
- **Start accounting integration:** If a pilot client uses Mekari Jurnal, possibly connect via their API (P1).
- **Refine pricing:** Based on pilot, set pricing tiers for services.

**Days 31–60 (Scale & polish):**

- **Add first automation:** Consider sending reminder emails via SMTP (with human review).
- **Official WhatsApp API (if budget):** Or use Twilio for programmable messaging (P2).
- **Complete Client Portal:** Let clients log in to see dashboard (Beta).
- **Add documentation:** Full user guide for operator.
- **Prepare for hires:** If workload grows, train a part-time assistant.

**Days 61–90 (Transition to product):**

- **Productize internal tools:** Build a simple client onboarding flow (self-import with guidance).
- **Explore payments integration:** Offer invoice financing partners to clients (future idea).
- **ROI reporting:** Enhance executive reports to show cashflow improvements quantitatively.
- **Decide direction:** If we have many similar clients, consider building a multi-tenant SaaS offering vs. staying consultancy-driven.

At each phase, maintain focus on solving actual pain points uncovered in pilots. We will add technology only if it saves significant operator time or improves sales (e.g., a referral link from an accounting vendor).

## Exact tasks for Day 1

To kick off, here are immediate tasks:

- **GitHub repo setup:** Create repo with README, initial README content.
- **Define tasks:** Make a simple board (Trello/GitHub Projects) and write tickets for Day-2 items.
- **Initial code structure:** mkdir backend frontend prisma .  npm init  in each.
- **Install dependencies:** Express, Prisma, jsonwebtoken in backend; Next.js, tailwind, shadcn/ui in frontend.
- **Initial Prisma schema:** Create base models (Organization, User, Membership).  npx prisma migrate dev.
- **Setup Express server:** src/server.ts  listens on port 3001, with JSON body parser.
- **Hello world endpoint:** GET /health returns 200.
- **Wireframe sketches:** Draw or note layout of Login, Dashboard, Invoices page.

These tasks can start immediately. The key is to lock down scope (no new features beyond P0). If impeded, cut the hardest non-essentials (e.g., postpone weekly report to Day 10-11).
