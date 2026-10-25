# Installment Management System

A private, **admin-only** MERN stack application for managing a personal installment
(loan/EMI) business — including optional investor-funded capital tracking. It replaces
a paper installment register with customer records, installment plans, payment tracking,
missed/overdue detection, profit & loss reporting, investor accounting, date-range
filtering, PDF/Excel exports, and printable receipts.

There is **only one admin user** (the Owner). There is no customer login, no customer
portal, no investor login, and no online payment gateway — the admin manually records
cash/bank payments and investor capital movements they've already received.

---

## 1. Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, React Router, Axios, React Hook Form, Zod,
Recharts, Lucide icons, react-hot-toast.

**Backend:** Node.js, Express, MongoDB + Mongoose, JWT auth, bcrypt, Helmet, CORS,
express-rate-limit, PDFKit (PDF export), ExcelJS (Excel export).

**Database:** MongoDB — works with either a local MongoDB instance for development or
MongoDB Atlas for production. No local filesystem or in-memory state is used, so the
app is safe to deploy on serverless platforms like Vercel.

---

## 2. Project Structure

```
installment-management-system/
├── backend/
│   ├── src/
│   │   ├── config/        # DB connection
│   │   ├── models/        # Mongoose schemas
│   │   ├── controllers/   # Route handlers
│   │   ├── routes/        # Express routers
│   │   ├── middleware/    # auth, error handling, rate limiting
│   │   ├── services/      # Core business logic (installments, dashboard)
│   │   ├── utils/         # PDF/Excel generators, id/date helpers
│   │   ├── app.js
│   │   └── server.js
│   ├── scripts/setupAdmin.js
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios client + endpoint wrappers
│   │   ├── components/    # Shared UI (tables, modals, cards, badges)
│   │   ├── context/       # Auth + theme (dark mode) context
│   │   ├── layouts/       # App shell (sidebar/topbar)
│   │   ├── pages/         # Route-level pages
│   │   ├── routes/        # ProtectedRoute guard
│   │   └── utils/         # Formatting helpers
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## 3. Core Business Rules (what this system guarantees)

- **Scheduled amount vs. actual payment are always kept separate.** A missed
  installment never silently disappears and is never treated as "paid 0."
- **0 payment → MISSED**, recorded as a separate event (not a `Payment` document).
  It does **not** reduce the plan's remaining balance — the missed amount stays
  outstanding.
- **Partial payment** reduces the installment's remaining amount and the plan's
  overall remaining balance by exactly the amount paid — no more, no less.
- **Overdue** is computed automatically for any `PENDING` installment whose due
  date has passed, but an installment the admin has explicitly marked `MISSED`
  is never silently overwritten.
- **Remaining balance** = `sellingPrice - downPayment - sum(actual payments)`.
  Missed amounts are *never* subtracted from remaining balance.
- **Profit/Loss** = `sellingPrice - purchaseCost`, calculated and stored
  server-side only (the frontend never sends profit numbers to be trusted).
- **Duration editing** and **monthly-installment editing** only regenerate
  *future, unpaid* installments. Any installment already `PAID`, `PARTIAL`, or
  `MISSED` is left completely untouched — due dates, amounts, and payment
  history are immutable once settled.
- Customers are **archived**, not deleted, once they have financial history.
- **Payment date vs. entry date are always separate.** When recording a payment, the
  admin picks the actual date the customer paid (`paymentDate`) — completely independent
  of `createdAt`, which Mongoose sets automatically to whenever the record was entered
  into the system. Logging a payment today for a customer who actually paid weeks ago
  keeps its true historical date, and date filters (e.g. "last month") match against
  that real payment date, not the entry date.

---

## 4. Local Setup

### Prerequisites
- Node.js 18+ and npm
- A local MongoDB instance (fastest for development, see 4.0 below) or a MongoDB Atlas
  account (see section 5)

### 4.0 Local MongoDB (recommended for development)

Install MongoDB Community Edition for your OS, then start it locally. By default it
listens on `mongodb://127.0.0.1:27017`. Set your backend's `.env` to:

```
MONGODB_URI=mongodb://127.0.0.1:27017/installment_management
```

No username/password is needed for a default local install. This is the fastest way to
develop and test the app end-to-end without touching Atlas at all — switch to Atlas
(section 5) only when you're ready to deploy to production.

### 4.1 Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env with your MongoDB URI (local or Atlas), JWT secret, and admin credentials (see section 6)
npm run setup-admin   # creates the one admin user
npm run dev           # starts the API on http://localhost:5000
```

### 4.2 Frontend

```bash
cd frontend
npm install
cp .env.example .env
# edit .env — VITE_API_URL should point at your backend, e.g. http://localhost:5000/api
npm run dev            # starts the app on http://localhost:5173
```

Open `http://localhost:5173`, sign in with the admin credentials you set in
`backend/.env`, and you're in.

---

## 5. MongoDB Atlas Setup

1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a new **Project**, then create a **Cluster** (the free M0 tier is enough
   for a small business).
3. Under **Database Access**, create a database user with a strong password
   (this is separate from your Atlas login).
4. Under **Network Access**, add an IP allow-list entry. For local development you
   can add your current IP; for a Vercel deployment, allow access from anywhere
   (`0.0.0.0/0`) since Vercel's serverless functions don't have static IPs.
5. Click **Connect → Drivers**, copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
6. Add a database name to the path (e.g. `.../installment-system?retryWrites=true...`)
   and paste the full string into `MONGODB_URI` in `backend/.env`.
7. Start the backend (`npm run dev`) and confirm you see
   `MongoDB connected: <cluster-host>` in the console.

---

## 6. Environment Variables

### backend/.env

```
NODE_ENV=development
PORT=5000
MONGODB_URI=                 # mongodb://127.0.0.1:27017/installment_management (local, section 4.0)
                              # or an Atlas connection string (section 5)
JWT_SECRET=                  # any long random string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173   # your frontend's origin, for CORS

ADMIN_NAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_SETUP_KEY=             # any random string — a safety check for the setup script
```

**Never commit a real `.env` file.** Only `.env.example` (with empty values) should
be in version control.

### frontend/.env

```
VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=Installment Management System
```

---

## 7. Admin Setup

There is intentionally no public registration route. The single admin account is
created once via a script that reads credentials from `backend/.env`:

```bash
cd backend
npm run setup-admin
```

This will:
- Connect to MongoDB using `MONGODB_URI`
- Verify `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_SETUP_KEY` are set
- Hash the password with bcrypt and create the `Admin` document
- Skip silently (no duplicate) if an admin with that email already exists

To change the admin password later, update `ADMIN_PASSWORD` in `.env` and either
re-run a modified version of the script or update it directly via a database client —
there is no in-app "reset password" flow by design, since this is a single-admin
system.

---

## 8. Deployment

### 8.1 Backend → Vercel

The backend is structured as an Express app exported from `src/server.js`, with a
`vercel.json` already configured to route all requests to it as a serverless function.

1. Push the `backend/` folder to a Git repository (or deploy the monorepo and set
   the Vercel **Root Directory** to `backend`).
2. In the Vercel dashboard, import the project.
3. Under **Settings → Environment Variables**, add every variable from
   `backend/.env.example` with real values (`MONGODB_URI`, `JWT_SECRET`,
   `JWT_EXPIRES_IN`, `CLIENT_URL`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `ADMIN_SETUP_KEY`).
4. Deploy. Note the resulting URL (e.g. `https://your-backend.vercel.app`).
5. Run `npm run setup-admin` **once**, locally, pointed at the same `MONGODB_URI`
   you configured in Vercel — this creates the admin user in the production database.
   (Vercel's serverless functions are stateless and not meant for one-off scripts.)

### 8.2 Frontend → Vercel

1. Push the `frontend/` folder to a Git repository (or set Vercel's **Root
   Directory** to `frontend` in a monorepo).
2. Import the project in Vercel. Vercel auto-detects the Vite framework preset.
3. Under **Settings → Environment Variables**, set:
   ```
   VITE_API_URL=https://your-backend.vercel.app/api
   VITE_APP_NAME=Installment Management System
   ```
4. Deploy.
5. Back in the **backend's** Vercel environment variables, set `CLIENT_URL` to
   this frontend's URL so CORS allows it, then redeploy the backend.

### 8.3 Production checklist

- [ ] `MONGODB_URI` points at your Atlas cluster with network access configured
- [ ] `JWT_SECRET` is a strong, unique random string (different from any dev value)
- [ ] `CLIENT_URL` (backend) exactly matches the deployed frontend origin
- [ ] `VITE_API_URL` (frontend) exactly matches the deployed backend's `/api` path
- [ ] Admin created in the production database via `npm run setup-admin`
- [ ] `.env` files are **not** committed anywhere in your Git history

---

## 9. Investor System

The app supports tracking money that came from investors rather than the business's
own funds, so the Owner can see — per investor — how much was invested, how much is
deployed into customer contracts, and how much is still available.

**Key ideas:**

- Investors are **not application users** — they never log in. The Owner manages
  everything about them from the Admin panel.
- Every dollar/rupee movement is a **transaction**, not an editable balance field:
  `INVESTMENT_IN`, `RETURN_TO_INVESTOR`, or `ADJUSTMENT`. Capital figures are always
  *derived* from these records, never hand-edited.
- **Capital formulas** (implemented in `backend/src/services/investorService.js`):
  ```
  Total Invested   = sum(INVESTMENT_IN)
  Total Returned   = sum(RETURN_TO_INVESTOR)
  Capital Held     = Total Invested − Total Returned
  Capital Deployed = sum(capitalDeployed across that investor's contracts)
  Capital Available = Capital Held − Capital Deployed
  ```
  Customer installment payments are **never** subtracted from investor capital — they're
  tracked separately as "Customer Collections" / "Outstanding", exactly as the business's
  own sales/profit are never mixed with investor capital on the dashboard.
- An `InstallmentPlan` (contract) has a `fundingSource` of `BUSINESS` or `INVESTOR`. When
  it's `INVESTOR`, an `investorId` and `capitalDeployed` amount are required. This
  reference is denormalized down onto every generated `Installment` and `Payment` so the
  full chain **Investor → Customer → Contract → Installment → Payment** can be queried
  directly without expensive joins.
- One customer can have multiple contracts funded by different investors (or the
  business itself) at the same time — this is a core supported scenario, not an edge case.
- Deleting an investor with no investment/contract history removes them permanently;
  an investor with history is safely archived instead — their transactions and funded
  contracts are never deleted or orphaned.
- The Investor Dashboard (`/investors/:id`) has tabs for Overview, Transactions, Funded
  Customers, Funded Contracts, Installments, Payments, Outstanding, Withdrawals, and
  Reports (with PDF/Excel export for each).

---

## 10. Owner System & Profit Sharing

The Owner is the single business operator — **not an investor**. The Owner has separate
capital and profit accounting, tracked in `Owner`/`OwnerTransaction`/`Withdrawal` models
and computed by `backend/src/services/accountingService.js`, the single authoritative
place all of this math lives (never duplicated in the frontend or in another controller).

### Multi-source funding

A contract's cost can be funded by the Owner alone, one Investor, or a mix of the Owner
and multiple Investors. Simple single-investor-or-business contracts keep using the
existing `InstallmentPlan.fundingSource`/`investorId`/`capitalDeployed` fields exactly as
before (fully backward compatible — nothing about old contracts changes). When a contract
needs a genuine multi-source split, a `FundingAllocation` row is created per funding
source (`POST /api/funding/:planId/allocate`); the backend rejects the whole allocation if
any single investor's amount exceeds their real available capital, or if the rows don't
sum exactly to the contract's required capital.

### Profit realization

Profit is only counted as **realized** in proportion to what's actually been collected
from the customer so far — an unpaid future installment's share of profit is never
treated as already earned:

```
collectionRatio = min(1, totalCollected / sellingPrice)
realizedProfit  = totalExpectedProfit × collectionRatio
```

This recalculates automatically every time a payment is recorded on an investor-funded
contract.

### The 50/50 split

For any contract with investor funding, realized profit is always split exactly in half:

```
ownerProfit    = realizedProfit × 0.5
investorPool   = realizedProfit × 0.5
```

If more than one investor funded the contract, `investorPool` is divided among them
**proportionally to their share of the contract's total investor funding** — not split
evenly per investor:

```
investor's share % = investor's funded amount / total investor funding on this contract
investor's profit  = investorPool × investor's share %
```

Worked example (matches the project's test suite): a product costs 15,000 and sells for
18,000 (profit 3,000), funded by Investor A (10,000) and Investor B (5,000):

```
Owner        = 3,000 × 50%              = 1,500
Investor pool = 3,000 × 50%             = 1,500
Investor A   = 1,500 × (10,000/15,000)  = 1,000
Investor B   = 1,500 × (5,000/15,000)   =   500
                                    Total = 3,000 ✓
```

### Withdrawals

A withdrawal is always a **strict 50/50 split** — the client only ever sends a single
`totalAmount`; the split itself is computed and enforced server-side, never accepted as
input:

```
investorAmount = totalAmount / 2
ownerAmount    = totalAmount − investorAmount   (absorbs any rounding remainder)
```

The withdrawal is rejected if `investorAmount` would exceed that investor's current
remaining profit share (`investorProfitShare − investorProfitWithdrawn`). For example, if
an investor's remaining profit share is 3,000, a total withdrawal of 6,000 is accepted
(investor side = 3,000, exactly at the limit) but 8,000 is rejected (investor side = 4,000
> 3,000 available).

Every withdrawal creates a permanent `Withdrawal` record plus a linked
`InvestorTransaction` (`RETURN_TO_INVESTOR`) and `OwnerTransaction` (`OWNER_WITHDRAWAL`)
— nothing is ever silently overwritten.

### Frontend pages

- `/owner` — Owner Dashboard: profit totals, per-investor Owner-profit breakdown, recent
  transactions and withdrawals
- `/withdrawals` — full withdrawal history across all investors, with investor filter,
  search, date filter, and pagination
- Inside Customer Details, "Edit Funding Allocation" opens a multi-source funding editor
  (Owner + any number of investors, each with a custom amount) for the active contract
- Inside Investor Details, a "Withdraw Profit" button and a dedicated Withdrawals tab

### Key API endpoints

```
GET  /api/owner/summary            Owner's total profit/withdrawn/remaining, per-investor breakdown
GET  /api/owner/transactions       Owner transaction ledger (date-filterable)
GET  /api/owner/withdrawals        All withdrawals across all investors
GET  /api/investors/:id/profit     One investor's full profit summary (generated/share/withdrawn/remaining, both sides)
GET  /api/investors/:id/withdrawals
POST /api/withdrawals              { investorId, totalAmount, withdrawalDate?, reference?, notes? }
POST /api/funding/:planId/allocate { allocations: [{ sourceType, investorId?, amount }] }
GET  /api/funding/:planId
```

---

## 11. Date Filters

Payments, installments, contracts, reports, and investor pages support filtering by:

`Today`, `Yesterday`, `This Week`, `Last Week`, `This Month`, `Last Month`, or a
`Custom Date Range` (From/To).

- The shared logic lives in `backend/src/utils/dateFilter.js` (`parseDateFilter`) and is
  applied **server-side** via MongoDB query ranges — large collections are never pulled
  into the browser just to be filtered client-side.
- Each entity filters on the field that actually matters for it: payments filter by
  payment date, installments by due date, contracts by sale/start date, and investor
  transactions by transaction date.
- No filter selected (`All Time`) means the complete lifetime history — filters never
  hide data by default.
- When a date filter is active on a report, its PDF/Excel export uses that same filter,
  so what's on screen matches what's downloaded.
- On Customer Details, the same filter is applied client-side to that one contract's
  already-loaded installment schedule (a small, per-contract dataset) — the customer's
  lifetime summary totals above the tabs are unaffected by the filter, so the Owner can
  always see both the filtered view and the true lifetime numbers at once.

---

## 12. Features Reference

| Area | What it does |
|---|---|
| Dashboard | Business, financial, collection, installment, and profit/loss overview — all from live MongoDB aggregation, no fake numbers |
| Customers | Add / edit / archive / search / filter, with full contract + payment history on one page |
| Installment plans | Product + pricing entry, preset or custom duration (1–60 months), automatic schedule generation, optional investor funding |
| Payments | Full, partial, and 0/missed payment recording, with confirmation prompts for missed installments |
| Duration & monthly-amount editing | Changes only future unpaid installments; historical records are immutable |
| Reports | Profit, loss, outstanding, overdue, missed-installment, and daily/monthly-collection reports, with date filters |
| Exports | PDF and Excel export for every report; PDF receipts and printable installment sheets; print-optimized CSS |
| Settings | Business name, contact info, currency, receipt footer, and a toggle for whether profit/cost appears on customer-facing receipts (off by default — profit is private) |
| Dark mode | Persisted per-browser, applies across every page |
| Responsive UI | Sidebar collapses to a drawer on mobile; tables scroll horizontally on small screens |

---

## 13. Notes

- All financial calculations (remaining balance, profit/loss, investor capital, totals)
  are computed **server-side** from the database — the frontend never sends numbers that
  are trusted as-is.
- Deleting a customer or investor with financial history is blocked in favor of a safe
  archive; permanent deletion is only allowed when there's genuinely nothing to lose.
- This project intentionally has no multi-user roles, no customer-facing or
  investor-facing login, and no payment gateway integrations, per the original
  specification.
- **PDF branding**: every generated PDF carries a fixed footer — `Developed by SHOUKAT |
  03348004300` — on every page. This is intentionally hard-coded and is not affected by
  Settings; only the header (business/owner info) is Settings-driven.
