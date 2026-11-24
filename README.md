# Multi-Tenant Service Request & Approval Management System

A secure, multi-organization enterprise service request and ticket management platform designed for multi-tenant B2B operations with strict data isolation, role-based access control, optimistic concurrency, and immutable transactional audit logging.

Built for the **Advanced Software Engineering Assessment (Neirah Tech Solutions)**.

---

## 📌 Features Overview

- **Strict Multi-Tenant Isolation:** Guaranteed at both application and database layers (composite foreign keys preventing cross-tenant data references).
- **Three-Tier Role-Based Access Control:**
  - **System Admin:** Platform operator managing organizations and organization managers. Zero access to private customer ticket content.
  - **Organization Manager:** Oversees company tickets, assigns/reassigns developers, reviews workload, manages team developers, and views audit logs.
  - **Developer:** Operates solely on assigned tickets, advances workflow from *Assigned* → *In Progress* → *Completed*.
- **Strict State Lifecycle & Matrix:** Enforced server-side:
  `Submitted` → `Under Review` → `Assigned` → `In Progress` → `Completed` (and `Completed` → `Reopened` → `In Progress` with mandatory reasons).
- **Engineering Challenges Implemented:**
  - **Optimistic Concurrency Control:** Version-based (`version` column) update checks preventing silent overwrites with `HTTP 409 Conflict`.
  - **Transactional Audit Logging:** Business updates and audit logs are committed or rolled back together in atomic database transactions (`trx`).
- **Comprehensive Password Security:**
  - Mandatory first-time login password change.
  - Normal password change option.
  - Secure single-use, time-limited forgot-password flow with simulated email logging.
  - Show/Hide password toggle across all forms.
- **Server-Side Operations:** Status filtering (including multi-status), priority filtering, search, date-range filtering, deterministic sorting, and pagination.

---

## 🛠️ Mandatory Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Tailwind CSS, React Router v6, Lucide Icons |
| **Backend** | Node.js, Express.js (TypeScript), Knex.js |
| **Database** | PostgreSQL with versioned schema migrations |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs password hashing |
| **Testing** | Vitest, Supertest, Custom automated verification suites |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js:** v18.x or v20.x or higher
- **npm:** v9.x or higher
- **PostgreSQL:** Running on `localhost:5432` with a database named `service_requests_dev`

---

### 2. Backend Setup

1. Open a terminal and navigate to `backend/`:
   ```bash
   cd backend
   npm install
   ```

2. Configure environment variables:
   Ensure `backend/.env` exists (see `backend/.env.example`). Example:
   ```env
   NODE_ENV=development
   PORT=4000

   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=1234
   DB_NAME=service_requests_dev

   JWT_SECRET=ab35ce98ce48557fca7aadceb8a88197c26c9894576aaed82871b72f0599c934
   JWT_EXPIRES_IN=1h

   CORS_ORIGIN=http://localhost:5173
   SEED_PASSWORD=Subangi27
   ```

3. Run database migrations:
   ```bash
   npm run db:migrate
   ```

4. Seed the database with demo organizations and users:
   ```bash
   npm run db:seed
   ```

5. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The API will start at `http://localhost:4000`.*

---

### 3. Frontend Setup

1. Open a second terminal window and navigate to `frontend/`:
   ```bash
   cd frontend
   npm install
   ```

2. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *Open your browser at `http://localhost:5173`.*

---

## 🔑 Demo Login Credentials

All seeded demo accounts use the password configured in `SEED_PASSWORD` (default: **`Subangi27`**).

| Role | Email | Password | Scope & Notes |
|---|---|---|---|
| **System Admin** | `admin@servicedesk.test` | `Subangi27` | Platform Admin; manages client companies and managers. |
| **Northwind Manager** | `nimal.manager@northwind.test` | `Subangi27` | Manager of *Northwind Traders*. Full access to Northwind tickets. |
| **Northwind Dev 1** | `kamal.dev@northwind.test` | `Subangi27` | Developer for *Northwind Traders*. Sees only tickets assigned to Kamal. |
| **Northwind Dev 2** | `sanduni.dev@northwind.test` | `Subangi27` | Developer for *Northwind Traders*. Sees only tickets assigned to Sanduni. |
| **Contoso Manager** | `ayesha.manager@contoso.test` | `Subangi27` | Manager of *Contoso Ltd*. Isolated from Northwind. |
| **Contoso Dev** | `ruwan.dev@contoso.test` | `Subangi27` | Developer for *Contoso Ltd*. Isolated from Northwind. |

---

## 🧪 Automated Testing

The backend includes a comprehensive test suite of **over 200 automated checks** covering tenant isolation, security, workflows, and the 10 mandatory acceptance scenarios from Section 8 of the assessment brief.

To execute tests, run from the `backend/` directory:

### 1. Mandatory Acceptance Test Suite (Vitest + Supertest)
```bash
npm test
```
*Executes all 10 mandatory acceptance test scenarios (§8 of assessment brief).*

### 2. Full Regression Suites
```bash
npm run check:auth         # 26 checks: Token expiry, invalid passwords, deactivation lockout
npm run check:users        # 46 checks: Organization & member isolation, deactivation audit
npm run check:requests     # 80 checks: CRUD, server-side filtering, pagination, sorting, concurrency
npm run check:transitions  # 13 checks: State transitions, assignment, reassignment reasons
npm run check:dashboard    # 12 checks: Role-aware counts, developer workload, request audit trail
npm run check:passwords    # 13 checks: First-time reset, normal change, secure forgot-password
```

### 3. Frontend Production Build Check
```bash
cd ../frontend
npm run build
```

---

## 📂 Repository Structure