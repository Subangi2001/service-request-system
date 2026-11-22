# Role–Permission Matrix

**Project:** Multi-Tenant Service Request & Approval Management System
**Sources:** Assessment PDF (§4, §5, §6, §8) and the candidate's confirmed decisions D1–D18.

This document says **who is allowed to do what**. The backend enforces every rule here. Hiding a button in the UI is never enough (PDF §4).

---

## 1. How to read this document

| Symbol / label | Meaning |
|---|---|
| ✅ | Allowed |
| ❌ | Not allowed |
| **PDF §x** | Stated in, or directly implied by, the assessment PDF |
| **D#** | A decision the candidate confirmed because the PDF is silent (see Section 8) |
| **A#** | An assumption added to fill a small gap (see Section 8). Listed in the final report |

**Default rule:** anything not listed as ✅ is denied.

---

## 2. The three roles (PDF §4)

| Role | What the PDF says |
|---|---|
| **System Admin** | Create/manage organizations and organization managers; view organization metadata. Cross-tenant request content access is **not granted by default**. |
| **Organization Manager** | Manage organization members; create/review/assign/reassign requests; view dashboard and audit trail for **own organization**. |
| **Developer** | View own-organization requests **assigned to them**; update permitted statuses; **cannot assign themselves or manage users**. |

---

## 3. Permission matrix

### 3.1 Login and profile

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| Log in with an **active** account | ✅ | ✅ | ✅ | PDF §5.1 |
| Log in with an **inactive** account | ❌ | ❌ | ❌ | PDF §5.1 |
| See own profile and own organization's name | ✅ | ✅ | ✅ | A1 |

### 3.2 Organizations

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| Create and manage organizations | ✅ | ❌ | ❌ | PDF §4 |
| View organization metadata (name, created date, member counts) of any organization | ✅ | ❌ | ❌ | PDF §4, A2 |

### 3.3 Users

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| Create **manager** accounts | ✅ | ❌ | ❌ | PDF §4, D18 |
| Activate / deactivate **managers** | ✅ | ❌ | ❌ | PDF §4, D18 |
| Create **developer** accounts (own organization) | ❌ | ✅ | ❌ | D11, D18 |
| View member list of **own** organization | ❌ | ✅ | ❌ | PDF §4 |
| Activate / deactivate **developers** (own organization) | ❌ | ✅ | ❌ | PDF §5.1, A3 |
| Do any of the above in **another** organization | ❌ | ❌ | ❌ | PDF §4 |

### 3.4 Service requests

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| **Create** a request | ❌ | ✅ | ❌ | PDF §4, D9 |
| View/list **all** requests of own organization | ❌ | ✅ | ❌ | PDF §4 |
| View/list requests **assigned to them** (own organization) | ❌ | (included above) | ✅ | PDF §4 |
| View a request from **another** organization | ❌ | ❌ | ❌ | PDF §4, §8 |
| **Edit** request details (while not Completed) | ❌ | ✅ | ❌ | PDF §5.2, D10, A4 |
| **Review** (Submitted → Under Review) | ❌ | ✅ | ❌ | PDF §4, D12 |
| **Assign** a developer (Under Review → Assigned) | ❌ | ✅ | ❌ | PDF §5.2, D12, D14 |
| **Reassign** (reason required) while Assigned, In Progress or Reopened | ❌ | ✅ | ❌ | PDF §5.2, D15 |
| **Assign themselves** | ❌ | (n/a) | ❌ | PDF §4, §8 |
| **Start work** (Assigned → In Progress), assigned developer only | ❌ | ❌ | ✅ | PDF §4, D12 |
| **Complete** (In Progress → Completed), assigned developer only | ❌ | ❌ | ✅ | PDF §4, §8, D12 |
| **Reopen** (Completed → Reopened), reason required | ❌ | ✅ | ❌ | PDF §8, D12, D13 |
| **Resume** (Reopened → In Progress), assigned developer only | ❌ | ❌ | ✅ | PDF §4, D12 |
| **Delete** a request | ❌ | ❌ | ❌ | A5 (the PDF lists create, list, view and edit only) |

### 3.5 Dashboard

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| Organization-wide request counts (total, pending, active, completed, overdue) | ❌ | ✅ (own org) | ❌ | PDF §4, §5.3, D16 |
| Counts of **own assigned** requests | ❌ | ❌ | ✅ | PDF §5.3, D17 |
| Organization and member counts only (no request content) | ✅ | ❌ | ❌ | D17 |
| Developer workload counts | ❌ | ✅ | ❌ | PDF §5.3, A6 |

### 3.6 Audit trail

| Action | Admin | Manager | Developer | Source |
|---|:---:|:---:|:---:|---|
| View audit trail | ❌ | ✅ (own org) | ❌ | PDF §4 |
| Edit or delete audit entries | ❌ | ❌ | ❌ | PDF §5.4 |

Audit entries are created automatically by the system. Users never create them directly.

---

## 4. Organization isolation rules

### 4.1 Required by the PDF

1. Every applicable read and write is scoped to the authenticated user's organization (§4).
2. Never trust `organizationId` or `role` sent by the client (§4).
3. Reject unauthorized actions at the API layer even when the UI hides the control (§4).
4. A request from another organization returns **403 or a non-disclosing 404**, with no data leaked (§8).
5. A forged `organizationId` in a payload is **ignored or rejected** and cannot change the tenant scope (§8).
6. Assigning a developer from another organization is rejected (§8).
7. The System Admin cannot read request content across organizations (§4).
8. No unauthorized data in API responses or the UI (§5.3).
9. Audit entries cannot be edited through standard endpoints (§5.4).

### 4.2 Choices made where the PDF allows more than one option

| Choice | Decision |
|---|---|
| Cross-organization lookup | Respond **404** (a 403 would reveal that the record exists). Also **404** when a developer asks for a same-organization request that is not assigned to them (A7) |
| Forged `organizationId` | **Ignore it.** Always use the organization of the logged-in user (A7) |

### 4.3 Where organization and role come from

| Value | Allowed source | Never from |
|---|---|---|
| Organization of the current user | The authenticated user (token + database) | Request body, query string, URL |
| Role of the current user | The authenticated user (token + database) | Request body, query string, URL |

---

## 5. Assignment rules (PDF §5.1, §5.2, §8)

| Rule | Result |
|---|---|
| Assign to an **active developer** in the **same organization** | Allowed (Manager only) |
| Assign to an **inactive** developer | Rejected |
| Assign to a developer of **another** organization | Rejected |
| Assign to a user who is **not a developer** (for example a manager) | Rejected (follows from "assign to an active developer") |
| A developer **assigns themselves** | Rejected |
| **Reassign** without a reason | Rejected |
| Reassign | Audited |
| Developer deactivated while holding assigned requests | The requests stay assigned. A manager reassigns them (A8) |

---

## 6. Actions written to the audit log (PDF §5.4, §8)

| Action | Logged |
|---|:---:|
| Request creation | ✅ |
| Assignment | ✅ |
| Reassignment (with reason) | ✅ |
| Every status change (actor, old value, new value, timestamp), including reopening (with reason, D13) | ✅ |
| User deactivation | ✅ |

Each entry records: request identifier (empty for user actions), organization, actor, action, before/after values, timestamp.

---

## 7. Quick summary

- **System Admin:** creates organizations and managers, activates/deactivates managers, sees organization metadata. **Never reads request content.**
- **Manager:** runs one organization. Creates, edits, reviews, assigns, reassigns and reopens requests, manages developers, sees the dashboard and audit trail. **Never touches another organization.**
- **Developer:** sees only requests **assigned to them**, starts, completes and resumes them. **Cannot self-assign or manage users.**

---

## 8. Decisions and assumptions

### Candidate decisions (PDF silent)

| # | Decision |
|---|---|
| D9 | Only managers create requests |
| D10 | Only managers edit requests, and not once Completed |
| D11 | Managers can create developer accounts in their own organization |
| D12 | Transitions: Manager does Submitted → Under Review, assigning, and Completed → Reopened. The assigned developer does Assigned → In Progress, In Progress → Completed and Reopened → In Progress |
| D13 | Only managers reopen, and a **reason is required** |
| D14 | Assigning automatically sets the status to Assigned (two audit rows) |
| D15 | Reassigning is allowed while Assigned, In Progress or Reopened |
| D16 | Pending = Submitted + Under Review. Active = Assigned + In Progress + Reopened. Completed and Overdue as in the PDF |
| D17 | Developer dashboard: own assigned counts. Admin dashboard: organization and member counts only |
| D18 | Admin creates managers and activates/deactivates managers, but not developers |

### Assumptions (to list in the report)

| # | Assumption |
|---|---|
| A1 | Every logged-in user may see their own profile and their own organization's name |
| A2 | "Organization metadata" means name, created date and member counts |
| A3 | Managers deactivate **developers** only. A manager cannot deactivate a manager (including themselves). This avoids an organization with no active manager |
| A4 | Editable fields: title, description, priority, category and deadline. Never status, assignee, organization, creator or reference number |
| A5 | No delete endpoints exist |
| A6 | Developer workload = number of active requests (Assigned, In Progress, Reopened) per developer |
| A7 | 404 for cross-organization or not-assigned lookups; forged `organizationId` ignored |
| A8 | A deactivated developer's requests stay assigned until a manager reassigns them |
