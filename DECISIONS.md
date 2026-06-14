# DECISIONS.md — Architectural Decisions

## 1. Soft Delete for Expenses

**Decision**: Use `deleted_at` timestamp instead of hard deletes.

**Alternatives considered**:
- Hard delete: simple but loses audit trail
- Archive table: overkill for this scale

**Reason**: Deleted expenses must be excluded from balance calculations but may need to be reviewed for disputes or audit purposes. Soft delete preserves history without complicating the query — all balance queries simply add `WHERE deleted_at IS NULL`.

---

## 2. Store Both Original Currency and INR

**Decision**: Every expense and split stores `amount`/`currency` (original) AND `amount_inr`/`conversion_rate` (computed at creation).

**Alternatives considered**:
- Convert everything to INR at read time: requires knowing the historical rate, introduces inconsistency
- Store only INR: loses original data, bad UX for USD entries

**Reason**: Exchange rates fluctuate. Computing INR at write time locks in the rate used and makes all balance arithmetic deterministic and auditable. The conversion rate is stored alongside for full traceability.

---

## 3. Configurable Conversion Rate via Environment Variable

**Decision**: `USD_TO_INR_RATE` is an environment variable, not hardcoded or fetched from a live API.

**Alternatives considered**:
- Live API (e.g., Open Exchange Rates): adds external dependency, latency, API key management
- Hardcoded rate: inflexible

**Reason**: For a flat-sharing scenario, a periodic manual rate update is acceptable and keeps the system offline-capable. The service is architected to accept a live rate source — swap `getConversionRate()` implementation to integrate a live API when needed.

---

## 4. CSV Import is a Two-Phase Wizard (Stage → Review → Apply)

**Decision**: Import never directly writes expenses. It creates an `ImportJob`, detects all anomalies, waits for user review, then applies on explicit user confirmation.

**Alternatives considered**:
- Import all rows, flag anomalous ones post-import: data already committed, harder to undo
- Reject entire CSV if any ERROR exists: too aggressive, many rows may be clean

**Reason**: The CSV contains real-world messy data (duplicates, missing fields, settlement mixed in). Silent modification would corrupt balances. The two-phase approach gives users full visibility and control. Per the requirements: "Never silently modify data."

---

## 5. Anomaly Detection Stored in Database (Not Just In-Memory)

**Decision**: Each anomaly is a `import_anomalies` row with full `row_data` JSON, `severity`, `description`, `suggestion`, `status`, `action_taken`.

**Alternatives considered**:
- Return anomalies in the upload response only (stateless): user can't resume review after page refresh
- Store only a summary: loses the row-level audit trail

**Reason**: Users may review large CSVs over multiple sessions. Storing per-anomaly resolution with `resolved_by` and `resolved_at` creates a complete audit log of who approved what and why.

---

## 6. Balance Computation is Always Live (Not Cached)

**Decision**: `GET /api/groups/:id/balances` always recomputes from raw expense + settlement data.

**Alternatives considered**:
- Cache balance snapshot in DB: fast reads but requires invalidation logic; can become stale
- Materialized view in PostgreSQL: complex migration, overkill at this scale

**Reason**: Correctness over performance. With hundreds of expenses, a full computation completes in <100ms. Every balance is always accurate and traceable to current data. Can be cached with Redis when scale demands it.

---

## 7. Debt Simplification Algorithm

**Decision**: Greedy matching — repeatedly pair the largest creditor with the largest debtor.

**Alternatives considered**:
- No simplification: too many transactions (O(n²) in the worst case)
- Linear programming: optimal but overkill for groups of 5–10 people

**Reason**: For typical group sizes (2–15 members), greedy produces the minimum or near-minimum transaction count. It's O(n log n) and easy to reason about. The "simplified debts" list is a suggestion — users can always settle in any way they prefer.

---

## 8. `group_members` Has a Composite Unique on `(group_id, user_id, joined_at)`

**Decision**: Allow re-joining with a different `joined_at` rather than a unique `(group_id, user_id)`.

**Alternatives considered**:
- `(group_id, user_id)` unique: prevents re-join modeling
- No unique constraint: allows duplicate active memberships

**Reason**: The CSV explicitly shows Meera leaving and potentially members rejoining later. The schema must support the full history of who was a member on a given date to correctly validate expense splits.

---

## 9. `is_settlement` Flag on Expenses vs Separate `settlements` Table

**Decision**: Settlements are a dedicated `settlements` table, not flagged rows in `expenses`.

**Alternatives considered**:
- `is_settlement = true` on expense: simpler schema but mixes fundamentally different concepts

**Reason**: Settlements have a different structure (fromUser, toUser, amount — no splits). Mixing them in `expenses` would require nullable fields and special-casing in every balance query. Keeping them separate makes the intent explicit and the balance service cleaner.

---

## 10. JWT-Only Auth (No Refresh Tokens for v1)

**Decision**: Single access token with a 7-day expiry.

**Alternatives considered**:
- Short-lived access + refresh token: more secure but more complex
- Session-based auth: doesn't suit a stateless REST API

**Reason**: For a personal expense-tracking tool with small teams, a 7-day JWT is a reasonable trade-off. Refresh token rotation can be added when session management becomes a requirement.

---

## 11. Prisma as ORM

**Decision**: Use Prisma over raw `pg` queries or Sequelize.

**Reason**: Type-safe queries, auto-generated client, excellent migration tooling, and the schema is the single source of truth. The Prisma client's relation handling (nested creates, includes) significantly reduces boilerplate for the expense + splits creation pattern.

---

## 12. TanStack Query for Frontend State

**Decision**: Use TanStack Query (React Query) instead of Redux or Zustand.

**Reason**: This app is primarily server state (expenses, balances, groups) with minimal client-only state. React Query provides caching, background refetch, loading/error states, and cache invalidation in far fewer lines than a Redux setup.
