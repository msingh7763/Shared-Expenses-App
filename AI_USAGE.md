# AI_USAGE.md — AI-Assisted Development Log

## Prompts Used

### 1. CSV Analysis
> "Analyze this CSV file. Identify: all columns, all split types present, all members, membership timeline, and every anomaly or data quality issue present in the data."

Used to systematically extract the full picture from the CSV before writing any code. The AI identified 17 distinct anomaly categories, including subtle ones like the ambiguous `04-05-2026` date and the `Priya S` name variant.

### 2. Database Schema Design
> "Design a normalized PostgreSQL schema for a shared expenses app supporting: users, groups with membership history, expenses with multiple split types (equal/unequal/percentage/share), settlements separate from expenses, and a CSV import system with per-anomaly audit log."

Generated the full Prisma schema with appropriate enums, nullable fields, soft deletes, and the two-table import system.

### 3. Balance Algorithm Design
> "Design a balance calculation algorithm that: attributes credits to payers, debits to split participants, accounts for settlements, produces a 'who owes whom' list via debt simplification, and links every balance entry back to its source expense/settlement ID."

Produced the `balanceService.js` architecture with the greedy debt simplification approach and per-user trace arrays.

### 4. Import Service Anomaly Detection
> "Implement 17 anomaly detection rules for a CSV expense import system. For each rule: detect it precisely, produce a severity (ERROR/WARNING/INFO), write a human-readable description of exactly what was found, and a specific actionable suggestion. Handle: duplicates, near-duplicates, negative amounts, zero amounts, missing paid_by, missing currency, invalid currency, settlement-as-expense, invalid members, split % mismatch, invalid dates, ambiguous dates, membership conflicts (Meera left Mar 31, Sam joined Apr 10), future dates, comma-formatted amounts, split type mismatch, name variants."

Generated the complete `importService.js` with all 17 detectors plus the two-phase staging/apply flow.

### 5. Frontend Architecture
> "Build a React + TailwindCSS dark-mode frontend with pages for: dashboard (group list, balance summary), group detail (member list with history), expenses (timeline with split breakdown), balances (net per member + who owes whom + expense trace), settlements (with suggested payments from simplified debts), and a 3-step import wizard (upload → anomaly review with approve/reject → import report)."

Generated all 10 pages with responsive dark-mode UI, modals, and TanStack Query integration.

---

## AI Limitations Encountered

### 1. Interactive CLI Prompts
**Issue**: `npm create vite@latest frontend -- --template react` triggered an interactive terminal prompt (framework selection) that cannot be automated in non-TTY environments.

**Resolution**: Scaffolded the Vite frontend manually by creating `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, and `index.html` from scratch with the correct configuration.

### 2. Context Window Constraints
**Issue**: Building a full-stack app with 20+ files in a single generation can hit context limits.

**Resolution**: Files were generated in logical batches (backend config → services → routes → frontend pages) rather than all at once, maintaining coherence.

### 3. Ambiguity in "share" Split Type
**Issue**: The CSV uses `share` as a split type (`Aisha 1; Rohan 2; Priya 1; Dev 2`) but the term "share" is not a standard Splitwise-style name.

**Resolution**: Implemented `share` as proportional splits — total shares computed, each member gets `(their_shares / total_shares) * total_amount`. Documented clearly in `splitCalculator.js`.

### 4. Membership Date Inference
**Issue**: The CSV doesn't have an explicit "Meera left" event — it's inferred from the farewell dinner (March 28) and the note "Meera moving out Sunday."

**Resolution**: Set `Meera.leftAt = 2026-03-31` (end of March) as the canonical boundary, consistent with the last day she would realistically be splitting rent and utilities.

### 5. Sam's Join Date Ambiguity
**Issue**: Sam's "deposit share" is on April 8, but his first group expense is April 10.

**Resolution**: Set `Sam.joinedAt = 2026-04-10` (first group expense date) and flagged the April 8 deposit row with a `MEMBERSHIP_CONFLICT` anomaly, letting the user decide whether to backdate Sam's join or treat the deposit as a settlement.

---

## Corrections Made

1. **Split mismatch detection tolerance**: Initial implementation used `=== 0` for remainder check, changed to `> 0.02` to account for floating-point arithmetic when amounts involve cents.

2. **Debt simplification floating-point**: Initial greedy loop had a precision issue where `0.001` imbalances would create spurious transactions. Fixed by applying `Math.round(...* 100) / 100` at each step and using `EPSILON = 0.01` as the zero threshold.

3. **CSV parser for comma-formatted numbers**: `csv-parse` with `relax_quotes: true` correctly handles `"1,200"` as a quoted field. The amount parser then strips commas and flags the row as `COMMA_FORMATTED_AMOUNT`.

4. **Import apply: row data reconstruction**: The first design stored only a summary per anomaly. Changed to store the full `rowData` JSON on every anomaly row so that `applyImport()` can reconstruct all rows without re-uploading the file.

5. **`requireGroupMember` error handling in Express**: Initial middleware threw an error that bypassed the JSON response. Changed to check the response after calling the helper and return early, preventing double-responses.
