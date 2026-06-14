# SCOPE.md — Spreetail Shared Expenses App

## CSV Source Analysis

The provided `Expenses Export.csv` covers **Feb 2026 – April 2026** with the following members:
- **Aisha** — permanent, joined Feb 1
- **Rohan** — permanent, joined Feb 1
- **Priya** — permanent, joined Feb 1
- **Meera** — joined Feb 1, **left March 31** (farewell dinner March 28)
- **Sam** — joined **April 10** (deposit paid April 8, first group expense April 10)
- **Dev** — **guest only** for Goa trip (March 8–12), not a permanent member

Split types found in CSV: `equal`, `unequal` (listed as "Rohan 700; Priya 400; Meera 400"), `percentage`, `share` (proportional units)

---

## Anomalies Found in CSV

### 1. DUPLICATE_EXPENSE (ERROR)
- **Row**: `08-02-2026, dinner - marina bites, Dev, 3200, INR, equal`
- **Detection**: Same date + same normalized description + same amount + same currency as row above (`Dinner at Marina Bites`)
- **Detection Logic**: Compare `(date, description.toLowerCase().replace(/[^a-z0-9\s]/g,''), amount, currency)` across all rows
- **Resolution Policy**: Reject one copy. Keep the original with notes ("Dev visiting for the weekend")

### 2. NEAR_DUPLICATE_EXPENSE (WARNING)
- **Rows**: `Dinner at Thalassa` (Aisha, 2400 INR) vs `Thalassa dinner` (Rohan, 2450 INR) — same date (11-03-2026), within 10% amount
- **Detection Logic**: Same date + description shares ≥8 chars of normalized form + amounts within 10% of each other
- **Resolution Policy**: User must review both. Notes indicate Aisha's may be wrong. Reject Aisha's or Rohan's after verification.

### 3. NEGATIVE_AMOUNT (WARNING)
- **Row**: `12-03-2026, Parasailing refund, Dev, -30, USD`
- **Detection Logic**: `amount < 0`
- **Resolution Policy**: Approve as a credit/refund. It adjusts the balance of the Goa group split.

### 4. ZERO_AMOUNT (WARNING)
- **Row**: `22-03-2026, Dinner order Swiggy, Priya, 0, INR`
- **Notes say**: "counted twice earlier - fixing later"
- **Detection Logic**: `amount === 0`
- **Resolution Policy**: Reject. Zero-amount expenses have no financial effect and create noise.

### 5. MISSING_PAID_BY (ERROR)
- **Row**: `22-02-2026, House cleaning supplies, [empty], 780, INR`
- **Notes say**: "can't remember who paid"
- **Detection Logic**: `paid_by` is empty
- **Resolution Policy**: Cannot import without a payer. User must assign a payer or split equally as a debt among all members.

### 6. MISSING_CURRENCY (ERROR)
- **Row**: `15-03-2026, Groceries DMart, Priya, 2105, [empty]`
- **Detection Logic**: `currency` field is blank
- **Resolution Policy**: Cannot import without currency. Based on context (domestic grocery), suggest INR. User must confirm.

### 7. SETTLEMENT_AS_EXPENSE (ERROR)
- **Row**: `25-02-2026, Rohan paid Aisha back, Rohan, 5000, INR`
- **Notes say**: "this is a settlement not an expense??"
- **Detection Logic**: Description contains settlement keywords (`paid back`, `paid aisha`) AND split_type is empty AND ≤2 members
- **Resolution Policy**: Reject as expense. Record via Settlements screen instead (`from: Rohan, to: Aisha, 5000 INR`).

### 8. COMMA_FORMATTED_AMOUNT (WARNING)
- **Row**: `10-02-2026, Electricity Feb, Aisha, "1,200", INR`
- **Detection Logic**: Amount string contains a comma
- **Resolution Policy**: Auto-parse by stripping commas → 1200. Approve to accept.

### 9. INVALID_MEMBER — Guest (INFO)
- **Row**: `11-03-2026, Parasailing, Dev, 150, USD` — `split_with` includes `Dev's friend Kabir`
- **Detection Logic**: Member name contains "friend" or "'s friend"
- **Resolution Policy**: Kabir cannot be tracked in the balance system. User must decide to either add Kabir as a temporary member, or re-split among existing members only.

### 10. SPLIT_MISMATCH — Percentage (ERROR)
- **Row**: `28-02-2026, Pizza Friday, Aisha, 1440, INR, percentage` — `Aisha 30%; Rohan 30%; Priya 30%; Meera 20%` = 110%
- **Notes say**: "percentages might be off"
- **Detection Logic**: Sum all percentage values; if `|sum - 100| > 0.01`, flag as mismatch
- **Resolution Policy**: Must correct percentages to sum to 100% before importing. Likely Meera should be 10%.

### 11. INVALID_DATE_FORMAT (WARNING)
- **Row**: `Mar-14, Airport cab, rohan, 1100, INR`
- **Detection Logic**: Date doesn't match `DD-MM-YYYY` pattern; matched as `Mon-DD` format
- **Resolution Policy**: Interpreted as `14-03-2026` (March 14, 2026 inferred). Approve if correct.

### 12. AMBIGUOUS_DATE (WARNING)
- **Row**: `04-05-2026, Deep cleaning service, Rohan, 2500, INR`
- **Notes say**: "is this April 5 or May 4? format is a mess"
- **Detection Logic**: In `DD-MM-YYYY` interpretation: May 4, 2026. In `MM-DD-YYYY` interpretation: April 5, 2026. Both `04` and `05` are ≤12.
- **Resolution Policy**: Treating as `DD-MM-YYYY` → May 4, 2026. Also flagged as FUTURE_DATE. User must confirm the actual date.

### 13. FUTURE_DATE (WARNING)
- **Row**: `04-05-2026` (Deep cleaning service)
- **Detection Logic**: Date > `2026-04-30` (last known expense date)
- **Resolution Policy**: Flag for review. If genuinely May 4, approve. If April 5, correct and re-import.

### 14. MEMBERSHIP_CONFLICT — Meera after leaving (ERROR)
- **Row**: `02-04-2026, Groceries BigBasket, Priya, 2640, INR` — `split_with` includes Meera
- **Notes say**: "oops Meera still in the group list"
- **Detection Logic**: Check each split_with member's active window against expense date. Meera's `leftAt = 2026-03-31`, expense date `2026-04-02 > 2026-03-31`
- **Resolution Policy**: Remove Meera from the split. Split among Aisha, Rohan, Priya only.

### 15. MEMBERSHIP_CONFLICT — Sam not yet joined (ERROR)
- **Row**: `08-04-2026, Sam deposit share, Sam, 15000, INR` — Sam in split_with
- **Detection Logic**: Sam's `joinedAt = 2026-04-10`, expense date `2026-04-08 < 2026-04-10`
- **Resolution Policy**: Sam paid his own deposit to Aisha. This is arguably a settlement. If treated as expense, Sam's join date could be backdated to April 8.

### 16. NAME_VARIANT (WARNING)
- **Row**: `18-02-2026, Groceries DMart, Priya S, 1875, INR` — payer "Priya S" vs known member "Priya"
- **Row**: `Mar-14, Airport cab, rohan [lowercase], 1100, INR` — "rohan" vs "Rohan"
- **Detection Logic**: Paid_by resolves to known member via prefix/substring match but differs from canonical name
- **Resolution Policy**: Normalize to canonical name ("Priya", "Rohan"). Approve.

### 17. SPLIT_TYPE_MISMATCH (WARNING)
- **Row**: `18-04-2026, Furniture for common room, Aisha, 12000, INR, equal` — has split_details `Aisha 1; Rohan 1; Priya 1; Sam 1`
- **Detection Logic**: `split_type === 'equal'` but `split_details` is non-empty
- **Resolution Policy**: If shares are all equal (1:1:1:1), the result is the same. Approve. If shares were unequal, change split_type to SHARE.

---

## Database Schema Explanation

### `users`
Core user identity. Stores hashed password, email (unique), username (unique), display name.

### `groups`
Expense group (e.g., "Flat Expenses 2026"). Groups are the top-level container for all expenses and settlements.

### `group_members`
Junction table with `joined_at` and `left_at` timestamps to track historical membership. A user can be a member of a group multiple times (rejoin support). Unique constraint on `(group_id, user_id, joined_at)`.

### `expenses`
Each shared expense. Has:
- `paid_by_id` (nullable — some CSV rows have no payer)
- `paid_by_name` (raw name for import traceability)
- `amount` + `currency` (original)
- `amount_inr` + `conversion_rate` (computed at creation)
- `split_type` (EQUAL/UNEQUAL/PERCENTAGE/SHARE)
- `is_settlement` flag (false for regular expenses)
- `deleted_at` for soft deletes
- `import_job_id` for traceability back to import

### `expense_splits`
Per-member split breakdown. Each row stores:
- `user_id` (nullable for guests)
- `user_name` (raw for imported data)
- `amount` (their share in original currency)
- `amount_inr` (converted)
- `percentage` / `share_units` for split_type traceability

### `settlements`
Records direct payments between two members (e.g., Rohan pays Aisha ₹5000). These are **separate from expenses** and affect balances differently — the payer's debt decreases.

### `import_jobs`
Tracks a single CSV import session: file name, status (`PENDING` → `PROCESSING` → `AWAITING_REVIEW` → `COMPLETED`/`FAILED`), row counts, and a JSON report.

### `import_anomalies`
One row per detected anomaly per import job. Stores:
- `row_number` and `row_data` (full raw CSV row) for full traceability
- `anomaly_type` (string enum)
- `severity` (ERROR/WARNING/INFO)
- `description` (human-readable explanation)
- `suggestion` (actionable advice)
- `status` (PENDING/APPROVED/REJECTED/AUTO_RESOLVED)
- `resolved_by`, `resolved_at`, `action_taken` for audit trail

---

## Membership Rules Implementation

```
Meera: joinedAt=2026-02-01, leftAt=2026-03-31
Sam:   joinedAt=2026-04-10, leftAt=null
Dev:   isGuest=true (special flag, not a permanent member)
```

Every expense's `split_with` members are checked against these windows. An expense dated `2026-04-02` with Meera in splits triggers `MEMBERSHIP_CONFLICT`.

---

## Balance Calculation

1. For each non-deleted, non-settlement expense:
   - **Payer** gets +`amountInr` credit
   - **Each split member** gets -`splitAmountInr` debit
2. For each settlement:
   - **fromUser** gets +`amountInr` credit (paid off their debt)
   - **toUser** gets -`amountInr` debit (received money, reduces their credit)
3. Net balance = sum of credits + debits
4. Positive net = others owe this person
5. Negative net = this person owes others

**Debt simplification**: Repeatedly match largest creditor ↔ largest debtor until all balanced. Produces minimum number of transactions.

**Traceability**: Every balance entry includes a `traces` array linking back to the source `expenseId` or `settlementId`.
