# ServiceDesk API Specification

**Base URL:** `http://localhost:4000/api`  
**Authentication:** HTTP Bearer token via `Authorization: Bearer <JWT>`  
**Standard Error Format:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error description",
    "details": {}
  }
}
```

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/login`
Logs in a user and returns a signed JWT token.

- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "nimal.manager@northwind.test",
    "password": "Subangi27"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "name": "Nimal Perera",
      "email": "nimal.manager@northwind.test",
      "role": "manager",
      "organizationId": 1,
      "mustChangePassword": false
    }
  }
  ```
- **Errors:** `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `400 VALIDATION_ERROR`.

---

### `GET /api/auth/me`
Returns details of the currently logged-in user.

- **Access:** Authenticated (`system_admin`, `manager`, `developer`)
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": 2,
      "name": "Nimal Perera",
      "email": "nimal.manager@northwind.test",
      "role": "manager",
      "organizationId": 1,
      "mustChangePassword": false,
      "organization": {
        "id": 1,
        "name": "Northwind Traders"
      }
    }
  }
  ```

---

### `POST /api/auth/change-password`
Changes the user's password (normal or first-time).

- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Password changed successfully."
  }
  ```

---

### `POST /api/auth/forgot-password`
Requests a password reset token.

- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "kamal.dev@northwind.test"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "If an account with that email exists, password reset instructions have been sent."
  }
  ```

---

### `POST /api/auth/reset-password`
Resets password using a single-use token.

- **Access:** Public
- **Request Body:**
  ```json
  {
    "token": "c51ccb504f98eb66...",
    "newPassword": "BrandNewPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Password has been reset successfully. You can now log in."
  }
  ```

---

## 2. Dashboard (`/api/dashboard`)

### `GET /api/dashboard`
Returns role-aware dashboard statistics.

- **Access:** `manager`, `developer`
- **Manager Response (200 OK):**
  ```json
  {
    "counts": {
      "total": 12,
      "pending": 3,
      "active": 6,
      "completed": 3,
      "overdue": 1
    },
    "workload": [
      {
        "id": 3,
        "name": "Kamal Perera",
        "email": "kamal.dev@northwind.test",
        "activeRequestsCount": 4
      }
    ]
  }
  ```
- **Developer Response (200 OK):**
  ```json
  {
    "counts": {
      "total": 4,
      "pendingAction": 1,
      "inProgress": 2,
      "completed": 1,
      "overdue": 0
    }
  }
  ```

---

## 3. Service Requests (`/api/requests`)

### `GET /api/requests`
List service requests with server-side filtering and pagination.

- **Access:** `manager` (sees all in org), `developer` (sees only assigned to them)
- **Query Parameters:**
  - `status`: Single or comma-separated list (e.g. `Submitted,Under Review`)
  - `isOverdue`: `true` | `false`
  - `priority`: `Low` | `Medium` | `High` | `Critical`
  - `assigneeId`: integer
  - `page`: default `1`
  - `limit`: default `20` (max 100)
  - `sortBy`: `createdAt` | `updatedAt` | `deadline` | `priority` | `status`
  - `sortOrder`: `asc` | `desc`
- **Response (200 OK):**
  ```json
  {
    "requests": [
      {
        "id": 1,
        "referenceNumber": "SR-000001",
        "title": "Fix checkout bug",
        "description": "Full description...",
        "priority": "High",
        "category": "Bug Fix",
        "status": "In Progress",
        "organizationId": 1,
        "createdBy": { "id": 2, "name": "Nimal Perera" },
        "assignee": { "id": 3, "name": "Kamal Perera" },
        "deadline": "2026-11-30T12:00:00.000Z",
        "completedAt": null,
        "isOverdue": false,
        "version": 3,
        "createdAt": "2026-11-23T10:00:00.000Z",
        "updatedAt": "2026-11-23T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 12,
      "totalPages": 2
    }
  }
  ```

---

### `POST /api/requests`
Creates a new request.

- **Access:** `manager` only
- **Request Body:**
  ```json
  {
    "title": "New feature request",
    "description": "Detailed explanation of requirements",
    "priority": "Medium",
    "category": "New Feature",
    "deadline": "2026-12-05T18:00:00.000Z"
  }
  ```
- **Response (201 Created):** Returns created request object.

---

### `GET /api/requests/:id`
Fetch single request details.

- **Access:** `manager` (same org), `developer` (only if assigned)
- **Response (200 OK):** Returns request object.
- **Errors:** `404 NOT_FOUND` (if across tenant or unassigned developer).

---

### `PATCH /api/requests/:id`
Edits a request with version-based optimistic locking.

- **Access:** `manager` only (while not `Completed`)
- **Request Body:**
  ```json
  {
    "version": 1,
    "title": "Updated title",
    "priority": "Critical"
  }
  ```
- **Errors:** `409 VERSION_CONFLICT` (if modified concurrently), `409 REQUEST_COMPLETED`.

---

### `POST /api/requests/:id/assign`
Assigns a developer from Under Review status.

- **Access:** `manager` only
- **Request Body:**
  ```json
  {
    "assigneeId": 3,
    "version": 1
  }
  ```
- **Response (200 OK):** Returns request in `Assigned` status.

---

### `POST /api/requests/:id/reassign`
Reassigns a developer with mandatory reason.

- **Access:** `manager` only (while in `Assigned`, `In Progress`, or `Reopened`)
- **Request Body:**
  ```json
  {
    "assigneeId": 4,
    "reason": "Kamal is out on medical leave",
    "version": 2
  }
  ```

---

### `POST /api/requests/:id/status`
Transitions a request along the lifecycle.

- **Access:** Permitted role based on transition matrix:
  - `Submitted` → `Under Review`: Manager
  - `Assigned` → `In Progress`: Assigned Developer
  - `In Progress` → `Completed`: Assigned Developer
  - `Completed` → `Reopened`: Manager (mandatory `reason`)
  - `Reopened` → `In Progress`: Assigned Developer
- **Request Body:**
  ```json
  {
    "status": "In Progress",
    "version": 2,
    "reason": "Optional reason (mandatory for Reopened)"
  }
  ```

---

### `GET /api/requests/:id/audit`
Returns immutable audit timeline for a request.

- **Access:** `manager` only
- **Response (200 OK):**
  ```json
  {
    "auditLogs": [
      {
        "id": 1,
        "action": "REQUEST_CREATED",
        "oldValue": null,
        "newValue": { "status": "Submitted" },
        "reason": null,
        "createdAt": "2026-11-23T10:00:00.000Z",
        "actor": { "id": 2, "name": "Nimal Perera", "role": "manager" }
      }
    ]
  }
  ```

---

## 4. Members & Users (`/api/users`)

### `GET /api/users`
Lists members of the manager's organization.

- **Access:** `manager` only
- **Query:** `?role=developer` (optional)

### `POST /api/users`
Creates a developer in the manager's organization.

- **Access:** `manager` only
- **Request Body:**
  ```json
  {
    "name": "Kasun Fernando",
    "email": "kasun.dev@northwind.test",
    "password": "InitialPassword123!"
  }
  ```

### `PATCH /api/users/:id/status`
Activates or deactivates a developer.

- **Access:** `manager` only
- **Request Body:**
  ```json
  {
    "isActive": false
  }
  ```

---

## 5. Organizations (`/api/organizations`)

### `GET /api/organizations`
Lists client organizations with member counts.

- **Access:** `system_admin` only

### `POST /api/organizations`
Creates a client organization.

- **Access:** `system_admin` only
- **Request Body:**
  ```json
  {
    "name": "Acme Corporation"
  }
  ```

### `GET /api/organizations/:id/managers`
Lists managers of an organization.

- **Access:** `system_admin` only

### `POST /api/organizations/:id/managers`
Creates a manager for an organization.

- **Access:** `system_admin` only

### `PATCH /api/organizations/:id/managers/:userId/status`
Activates or deactivates an organization manager.

- **Access:** `system_admin` only