# Status Transition Matrix

**Project:** Multi-Tenant Service Request & Approval Management System
**Sources:** Assessment PDF (§5.2, §5.4, §8) and the candidate's confirmed decisions D1–D18.

This document says **how a request's status may change**. The backend enforces it (PDF §5.2). The UI only shows buttons.

**Labels:** **PDF §x** = stated in the PDF. **D#** = candidate decision (PDF silent). **A#** = assumption, listed in the report.

---

## 1. Statuses (PDF §5.2)

Exactly six: **Submitted, Under Review, Assigned, In Progress, Completed, Reopened.**

> **Overdue is not a status.** It is calculated from the deadline and the status (PDF §5.4): `deadline < now AND status ≠ Completed`.

---

## 2. Workflow (PDF §5.2)

```
Submitted → Under Review → Assigned → In Progress → Completed
                                          ▲             │
                                          └── Reopened ◄┘
                         (Completed → Reopened → In Progress)
```

---

## 3. Allowed transitions

Every other move is **rejected** and the status stays unchanged (PDF §8).

| # | From | To | Who | Conditions | Source |
|---|---|---|---|---|---|
| 1 | Submitted | Under Review | Manager | Request is in the manager's organization | PDF §5.2, D12 |
| 2 | Under Review | Assigned | Manager (through the **assign** action) | The assignee is an **active developer of the same organization**. Assigning sets the assignee **and** this status in one step (D14) | PDF §5.2, D12, D14 |
| 3 | Assigned | In Progress | The **assigned developer** | Acting developer is the request's assignee | PDF §4, D12 |
| 4 | In Progress | Completed | The **assigned developer** | Acting developer is the assignee. Sets `completed_at` | PDF §8, D12 |
| 5 | Completed | Reopened | Manager | **Reason required** (D13). Clears `completed_at` | PDF §8, D12, D13 |
| 6 | Reopened | In Progress | The **assigned developer** | Acting developer is the assignee | PDF §5.2, D12 |

**Managers cannot** move a request to In Progress or Completed. **Developers cannot** review, assign or reopen.

### Examples of rejected moves (use them as tests)

| Attempted move | Why rejected |
|---|---|
| Submitted → Assigned, Submitted → In Progress, Submitted → Completed | Skips steps |
| Under Review → In Progress / Completed | Skips steps |
| In Progress → Submitted or Under Review | Backward moves are not in the PDF |
| Completed → In Progress (directly) | Must go through Reopened |
| Reopened → Completed | Must go back through In Progress |
| Any status → the same status | Not a change (A9) |
| A developer who is **not the assignee** tries any move | Rejected. The request is not visible to them (404, A7) |
| A manager tries Assigned → In Progress | Wrong role |

> **"Unassigned developer tries completion" (PDF §8):** only the assigned developer can complete. A developer who is not the assignee is rejected. A request without an assignee can never reach In Progress, so it cannot be completed (D14, D8 constraint).

---

## 4. Assignment and reassignment

| Situation | Rule | Source |
|---|---|---|
| First assignment | Only from **Under Review**. Sets assignee and status Assigned in **one transaction**, with **two audit rows**: `REQUEST_ASSIGNED` and `STATUS_CHANGED` | D14 |
| Reassignment | Manager only, while **Assigned, In Progress or Reopened**. **Reason required.** Only the assignee changes. The status stays the same. One audit row `REQUEST_REASSIGNED` with the reason | PDF §5.2, D15 |
| Reassign a Completed, Submitted or Under Review request | Rejected | D15 |
| Assignee must be | An **active developer** of the same organization, and not the same person as the current assignee (A10) | PDF §5.2, §8 |
| Request holds an assignee | Required in Assigned, In Progress, Completed and Reopened. Enforced by a database constraint | D8 |

There is **no "unassign" action**.

---

## 5. The reopening workflow

| Step | What happens | Status after |
|---|---|---|
| 1 | A manager reopens a Completed request and gives a **reason** | Reopened |
| 2 | Audit row: actor, `Completed` → `Reopened`, **reason**, timestamp. `completed_at` is cleared | — |
| 3 | The assigned developer resumes the work | In Progress |
| 4 | Audit row: actor, `Reopened` → `In Progress`, timestamp | — |

- The **assignee stays the same** after reopening. If that developer was deactivated, the manager reassigns while the request is Reopened (D15, A8).
- A Reopened request is **not completed**. If its deadline has passed, it counts as **overdue** again (PDF §5.4).
- When the request is completed again, `completed_at` is set to the new time. The earlier completion time remains in the audit log.

---

## 6. Rules for every status change

| # | Rule | Source |
|---|---|---|
| 1 | Only authorized roles start a transition | PDF §5.2 |
| 2 | Enforced on the backend | PDF §5.2 |
| 3 | Record actor, old value, new value, timestamp | PDF §5.2, §5.4 |
| 4 | An invalid transition is rejected and the status stays unchanged | PDF §8 |
| 5 | The request must belong to the user's organization | PDF §4 |
| 6 | Developers only touch requests assigned to them | PDF §4 |
| 7 | The status update and its audit row(s) are saved in **one database transaction** | Chosen engineering challenge (PDF §6) |
| 8 | `completed_at` is set when the status becomes Completed and is empty in every other status (database constraint) | D5 |
| 9 | Every update increases the `version` number | D4 |

---

## 7. Mapping to the PDF acceptance tests (§8)

| Acceptance test | Related rule |
|---|---|
| Invalid status transition → rejected, status unchanged | Section 3 |
| Unassigned developer tries completion → rejected | Section 3 note, rule 6 |
| Completed request reopened → allowed for authorized role and audited | Section 5 |
| Assign inactive developer → rejected | Section 4 |
| Assign developer from another tenant → rejected | Section 4 |
| Developer attempts self-assignment → rejected | Section 4 (Manager only) |
| Concurrent update (if selected) | Applies only if optimistic concurrency is chosen |

---

## 8. Decisions and assumptions used

| # | Decision or assumption |
|---|---|
| D4 | Keep a `version` column |
| D5 | `completed_at` exists, set on Completed, cleared on reopen |
| D8 | Assigned, In Progress, Completed and Reopened must have an assignee (database constraint) |
| D12 | Who performs each transition (Section 3) |
| D13 | Only managers reopen, reason required |
| D14 | Assigning sets Assigned automatically, with two audit rows |
| D15 | Reassign while Assigned, In Progress or Reopened |
| A7 | Cross-organization and not-assigned lookups return 404 |
| A8 | Requests of a deactivated developer stay assigned until reassigned |
| A9 | A transition to the same status is rejected |
| A10 | Reassigning to the current assignee is rejected |
