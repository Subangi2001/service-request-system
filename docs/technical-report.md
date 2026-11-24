# Technical Assessment Report: Multi-Tenant Service Request & Approval Platform

**Candidate:** Subangi Kalanithy  
**Position:** Software Engineer Intern  
**Company:** Neirah Tech Solutions (Sri Lanka)  
**System:** Multi-Tenant Service Request & Approval Management System  
**Date:** November 2026  

---

## 1. Executive Summary

This report documents the design, architectural decisions, and implementation of the Multi-Tenant Service Request & Approval Management System. The platform addresses a realistic business scenario where a central service company supports multiple distinct client organizations under a shared infrastructure. 

The primary architectural drivers prioritized for this project are **correctness, data integrity, and strict tenant isolation** over superficial polish, strictly conforming to the assessment guidelines.

---

## 2. Relational Architecture & Relational Data Modeling

### 2.1 Database Tables & Relationships
The relational schema is built on PostgreSQL across five normalized tables:
1. `organizations`: Tenant entities. Enforces unique, trimmed organization names.
2. `users`: System users categorized into three distinct roles (`system_admin`, `manager`, `developer`).
3. `service_requests`: Core business entity representing service tickets with auto-incrementing reference sequence (`SR-000001`).
4. `audit_logs`: An immutable append-only event ledger capturing actor, action, old/new values, reasons, and timestamps.
5. `password_reset_tokens`: Security table storing SHA-256 hashes of time-limited, single-use password reset tokens.

### 2.2 Deep Relational Isolation (Composite Foreign Keys)
A common multi-tenancy vulnerability in standard applications is relying purely on application-level filtering (`WHERE organization_id = ?`), which is susceptible to developer oversights. 

In this system, multi-tenancy is enforced **at the database constraint layer**:
- A unique constraint exists on `users (organization_id, id)`.
- The `service_requests` table links to `users` using **composite foreign keys**:
  ```sql
  CONSTRAINT service_requests_creator_same_org_fk
    FOREIGN KEY (organization_id, created_by)
    REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT service_requests_assignee_same_org_fk
    FOREIGN KEY (organization_id, assignee_id)
    REFERENCES users (organization_id, id) ON DELETE RESTRICT
  ```
This makes cross-tenant data corruption mathematically impossible at the database engine level. Even if a compromised client sends a valid developer ID belonging to another organization, PostgreSQL automatically rejects the write.

---

## 3. Security Decisions & Role-Based Access Control

### 3.1 Strict Scoping & Identity Isolation
- **Authentication:** Stateless JSON Web Tokens (JWT) using `HS256`. The JWT payload carries solely the immutable user ID (`sub: userId`). Role and tenant context are dynamically resolved from the PostgreSQL database on every request inside the `authenticate` middleware. This guarantees that role changes or account deactivations take effect immediately.
- **Tenant Scope Enforcement:** Client-supplied `organizationId` or `role` parameters are strictly rejected or stripped from write payloads. All tenant scoping is injected directly from the verified session actor (`organizationIdOf(actor)`).
- **Non-Disclosing 404s:** When an unauthorized actor attempts to access an out-of-scope ticket or another tenant's resource, the API returns `404 NOT_FOUND` rather than `403 FORBIDDEN`. This completely eliminates user enumeration and ticket probing attacks.
- **Credential Storage:** Passwords are never stored in plaintext. They are salted and hashed using `bcrypt` (work factor 10). Password hashes are never selected into API responses.

---

## 4. Engineering Challenges Analysis (Assessment §6)

We selected and implemented **two** advanced engineering challenges from the assessment brief:

### 4.1 Challenge 1: Optimistic Concurrency Control
In a multi-user service desk, concurrent edits present a major race condition (the "lost update" problem). For example, if two managers open ticket #1 simultaneously and Manager A updates the deadline while Manager B updates the priority, a naive database update would silently overwrite Manager A's change.

#### Design & Implementation:
- Every `service_requests` record maintains an integer `version` column starting at `1`.
- Any modification request (`PATCH /api/requests/:id`, status transition, or reassignment) requires the client to supply the `version` it last observed.
- The SQL update executes atomically:
  ```sql
  UPDATE service_requests 
  SET title = ?, version = version + 1, updated_at = now()
  WHERE id = ? AND organization_id = ? AND version = ?;
  ```
- If `updatedRows === 0`, the server queries the current row to diagnose the cause:
  - If the row exists but has an incremented version, it throws an `AppError(409, 'VERSION_CONFLICT', ...)` returning `{ currentVersion: current.version }`.
  - If the status is `Completed`, it throws `AppError(409, 'REQUEST_COMPLETED', ...)`.
- The frontend captures `409 Conflict`, informs the user that another teammate modified the ticket, and reloads the fresh state without losing data.

#### Failure Modes & Trade-offs:
- *Trade-off:* Requires clients to manage version state. However, compared to pessimistic row locking (`SELECT FOR UPDATE`), optimistic concurrency introduces zero database lock contention and scales seamlessly across high traffic.

---

### 4.2 Challenge 2: Transactional Audit Logging
Regulatory compliance and operational accountability require that every sensitive modification (creation, assignment, reassignment, status transition, and user deactivation) is permanently auditable.

#### Design & Implementation:
- Audit records and business modifications are wrapped within atomic Knex database transactions (`db.transaction(async (trx) => { ... })`).
- `writeAudit()` requires an active `Knex.Transaction` instance. A standalone connection cannot write to `audit_logs`.
- If an audit insert fails (e.g., constraint failure or disk limit), the entire transaction aborts, and the business update is completely rolled back.
- **Audit Table Immutability:** The application exposes only `INSERT` and `SELECT` queries for `audit_logs`. No endpoints or database functions exist to update or delete audit records.

---

## 5. Automated Verification & Acceptance Results

The repository features an automated test harness with **over 200 automated checks**:
- **Acceptance Tests (`src/__tests__/acceptance.test.ts`):** 10 out of 10 automated test suites matching Section 8 of the assessment brief run via Vitest and Supertest:
  1. Cross-organization request lookup (`404` non-disclosing).
  2. Forged `organizationId` payload injection (ignored; tenant preserved).
  3. Assign inactive developer (rejected with business error).
  4. Assign developer from another tenant (rejected with business error).
  5. Developer attempts self-assignment (rejected `403`).
  6. Invalid status transition (rejected; status unchanged).
  7. Unassigned developer tries completion (rejected).
  8. Concurrent update race condition (`409 Conflict` detected, no overwrite).
  9. Completed request reopened (allowed for manager with reason, audited).
  10. Malformed/empty required input (`400 Validation Error`).
- **Regression Suites:** Auth checks (26), Request checks (80), Transition checks (13), Dashboard checks (12), Password checks (13).

---

## 6. Assumptions & Limitations

### Assumptions:
1. **Organization Deactivation:** Not implemented because the assessment PDF specifies activating/deactivating *users* (managers and developers), but does not state requirements for deactivating whole client companies.
2. **Fixed Categories:** Standardized to five values (`Bug Fix`, `New Feature`, `Maintenance`, `Technical Support`, `Other`) to maintain data consistency.
3. **Overdue Status:** Computed dynamically (`deadline < now() AND status <> 'Completed'`) rather than stored in a column, eliminating stale flags if deadlines pass without write operations.

### Future Enhancements:
1. **Live Email Delivery:** Integrating AWS SES or SendGrid via Nodemailer to replace the local console simulator.
2. **WebSockets / Server-Sent Events (SSE):** Real-time ticket updates across active browser tabs.
3. **File Attachments:** S3-compatible object storage for uploading screenshots and logs directly to service requests.