# Spreetail — Shared Expenses App

A production-ready shared expenses application with group management, multi-currency support, debt simplification, and a fully featured CSV import wizard with anomaly detection.

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 18 + Vite + TailwindCSS           |
| Backend    | Node.js + Express 5                     |
| Database   | PostgreSQL via Prisma ORM               |
| Auth       | JWT (jsonwebtoken + bcryptjs)           |
| HTTP       | Axios + TanStack Query                  |

---

## Project Structure

```
spreetail/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Full DB schema
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js        # Prisma singleton
│   │   │   └── logger.js          # Winston logger
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT middleware
│   │   │   ├── errorHandler.js    # Global error handler
│   │   │   └── validate.js        # express-validator result handler
│   │   ├── routes/
│   │   │   ├── auth.js            # Register, login, /me
│   │   │   ├── groups.js          # Group CRUD + member management
│   │   │   ├── expenses.js        # Expense CRUD with split calculation
│   │   │   ├── balances.js        # Balance computation
│   │   │   ├── settlements.js     # Settlement recording
│   │   │   └── import.js          # CSV import wizard API
│   │   ├── services/
│   │   │   ├── balanceService.js  # Balance + debt simplification
│   │   │   ├── currencyService.js # INR/USD conversion
│   │   │   └── importService.js   # CSV parser + 17 anomaly detectors
│   │   ├── utils/
│   │   │   └── splitCalculator.js # Equal/unequal/percentage/share splits
│   │   └── index.js               # Express app entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── context/AuthContext.jsx
│   │   ├── lib/api.js             # Axios API client
│   │   ├── components/Layout.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── GroupPage.jsx
│   │   │   ├── ExpensesPage.jsx
│   │   │   ├── BalancesPage.jsx
│   │   │   ├── SettlementsPage.jsx
│   │   │   ├── ImportPage.jsx
│   │   │   ├── AnomalyReviewPage.jsx
│   │   │   └── ImportReportPage.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE spreetail_db;"
```

### 2. Backend Setup

```bash
cd backend

# Copy and configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed with demo data (creates 6 users + 1 group)
node src/prisma/seed.js

# Start development server
npm run dev
```

Backend runs on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## Demo Accounts

After seeding, all accounts use password `password123`:

| User    | Email                  |
|---------|------------------------|
| Aisha   | aisha@example.com      |
| Rohan   | rohan@example.com      |
| Priya   | priya@example.com      |
| Meera   | meera@example.com      |
| Sam     | sam@example.com        |
| Dev     | dev@example.com        |

---

## API Reference

### Auth
| Method | Endpoint             | Description        |
|--------|----------------------|--------------------|
| POST   | /api/auth/register   | Register new user  |
| POST   | /api/auth/login      | Login, get JWT     |
| GET    | /api/auth/me         | Current user info  |
| PATCH  | /api/auth/me         | Update profile     |

### Groups
| Method | Endpoint                              | Description              |
|--------|---------------------------------------|--------------------------|
| GET    | /api/groups                           | List my groups           |
| POST   | /api/groups                           | Create group             |
| GET    | /api/groups/:id                       | Get group details        |
| PATCH  | /api/groups/:id                       | Update group             |
| DELETE | /api/groups/:id                       | Delete group             |
| POST   | /api/groups/:id/members               | Add member               |
| PATCH  | /api/groups/:id/members/:userId       | Update membership        |
| DELETE | /api/groups/:id/members/:userId       | Remove member            |
| GET    | /api/groups/:id/members/history       | Full membership history  |

### Expenses
| Method | Endpoint                          | Description         |
|--------|-----------------------------------|---------------------|
| GET    | /api/groups/:id/expenses          | List expenses       |
| POST   | /api/groups/:id/expenses          | Create expense      |
| GET    | /api/expenses/:id                 | Get expense detail  |
| PATCH  | /api/expenses/:id                 | Update expense      |
| DELETE | /api/expenses/:id                 | Soft delete         |

### Balances
| Method | Endpoint                          | Description                         |
|--------|-----------------------------------|-------------------------------------|
| GET    | /api/groups/:id/balances          | Group balances + who owes whom      |
| GET    | /api/users/me/balances            | My balance summary across groups    |

### Settlements
| Method | Endpoint                              | Description              |
|--------|---------------------------------------|--------------------------|
| GET    | /api/groups/:id/settlements           | List settlements         |
| POST   | /api/groups/:id/settlements           | Record settlement        |
| DELETE | /api/settlements/:id                  | Delete settlement        |

### Import
| Method | Endpoint                                              | Description                      |
|--------|-------------------------------------------------------|----------------------------------|
| POST   | /api/import/upload?groupId=xxx                        | Upload CSV, detect anomalies     |
| GET    | /api/import/:jobId                                    | Get job status + anomalies       |
| PATCH  | /api/import/:jobId/anomalies/:anomalyId               | Resolve anomaly (APPROVED/REJECTED) |
| POST   | /api/import/:jobId/anomalies/bulk-resolve             | Bulk resolve by severity         |
| POST   | /api/import/:jobId/apply                              | Commit approved rows             |
| GET    | /api/import/:jobId/report                             | Full import report               |

---

## Currency Support

- **INR** and **USD** supported
- Conversion rate: configurable via `USD_TO_INR_RATE` env var (default: 84.5)
- All balances computed in INR for uniformity
- Original currency always preserved alongside converted amount

## CSV Import Format

```csv
date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
01-02-2026,February rent,Aisha,48000,INR,equal,Aisha;Rohan;Priya;Meera,,
```

- `split_with`: semicolon-separated member names
- `split_details`: depends on split_type
  - `percentage`: `Aisha 30%; Rohan 30%; Priya 40%`
  - `unequal`: `Rohan 700; Priya 400; Meera 400`
  - `share`: `Aisha 1; Rohan 2; Priya 1`
