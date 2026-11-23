import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../db';

describe('Mandatory Acceptance Tests (PDF Section 8)', () => {
  let northwindManagerToken: string;
  let contosoManagerToken: string;
  let devKamalToken: string;
  let devSanduniToken: string;
  let devRuwanToken: string;

  let northwindManager: any;
  let contosoManager: any;
  let devKamal: any;
  let devSanduni: any;
  let devRuwan: any;
  let inactiveDev: any;

  const createdRequestIds: number[] = [];

  const password = process.env.SEED_PASSWORD?.trim() || 'Password123!';

  // Helper to log in and get JWT token
  async function login(email: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  beforeAll(async () => {
    // 1. Fetch demo users from seeded database
    northwindManager = await db('users').where({ email: 'nimal.manager@northwind.test' }).first();
    contosoManager = await db('users').where({ email: 'ayesha.manager@contoso.test' }).first();
    devKamal = await db('users').where({ email: 'kamal.dev@northwind.test' }).first();
    devSanduni = await db('users').where({ email: 'sanduni.dev@northwind.test' }).first();
    devRuwan = await db('users').where({ email: 'ruwan.dev@contoso.test' }).first();

    // 2. Create an inactive developer for Northwind to test inactive assignment rejection
    const existingInactive = await db('users')
      .where({ email: 'inactive.dev@northwind.test' })
      .first();

    if (!existingInactive) {
      const [user] = await db('users')
        .insert({
          organization_id: northwindManager.organization_id,
          name: 'Inactive Dev',
          email: 'inactive.dev@northwind.test',
          password_hash: devKamal.password_hash,
          role: 'developer',
          is_active: false,
        })
        .returning('*');
      inactiveDev = user;
    } else {
      inactiveDev = existingInactive;
    }

    // 3. Obtain tokens for different actors
    northwindManagerToken = await login('nimal.manager@northwind.test');
    contosoManagerToken = await login('ayesha.manager@contoso.test');
    devKamalToken = await login('kamal.dev@northwind.test');
    devSanduniToken = await login('sanduni.dev@northwind.test');
    devRuwanToken = await login('ruwan.dev@contoso.test');
  });

  afterAll(async () => {
    // Clean up created requests and their audit logs
    if (createdRequestIds.length > 0) {
      await db('audit_logs').whereIn('request_id', createdRequestIds).del();
      await db('service_requests').whereIn('id', createdRequestIds).del();
    }
    // Clean up temporary inactive developer if created
    if (inactiveDev?.email === 'inactive.dev@northwind.test') {
      await db('audit_logs').where({ target_user_id: inactiveDev.id }).del();
      await db('users').where({ id: inactiveDev.id }).del();
    }
  });

  // Helper to create a test request in Northwind
  async function createNorthwindRequest(overrides = {}): Promise<any> {
    const payload = {
      title: 'Acceptance Test Ticket',
      description: 'Used for verifying PDF Section 8 scenarios',
      priority: 'High',
      category: 'Bug Fix',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.request.id);
    return res.body.request;
  }

  // -------------------------------------------------------------
  // Scenario 1: Cross-organization request lookup
  // Expected: 403 or non-disclosing 404; no data leakage
  // -------------------------------------------------------------
  it('1. Cross-organization request lookup -> 404 / no data leakage', async () => {
    const req = await createNorthwindRequest();

    // Contoso Manager attempts to read Northwind's request
    const res = await request(app)
      .get(`/api/requests/${req.id}`)
      .set('Authorization', `Bearer ${contosoManagerToken}`);

    // Must return 404 non-disclosing so attacker cannot probe valid IDs
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
    expect(res.body.request).toBeUndefined();
  });

  // -------------------------------------------------------------
  // Scenario 2: Forged organizationId in payload
  // Expected: Ignored or rejected; cannot change tenant scope
  // -------------------------------------------------------------
  it('2. Forged organizationId in payload -> ignored; cannot change tenant scope', async () => {
    // Northwind manager tries to create a ticket on behalf of Contoso (orgId: contosoManager.organization_id)
    const forgedPayload = {
      title: 'Forged Org Request',
      description: 'Attempting to inject a different organizationId',
      priority: 'Low',
      category: 'Other',
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      organizationId: contosoManager.organization_id,
    };

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send(forgedPayload);

    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.request.id);

    // Organization must remain Northwind's ID, forged org was ignored
    expect(res.body.request.organizationId).toBe(northwindManager.organization_id);
    expect(res.body.request.organizationId).not.toBe(contosoManager.organization_id);
  });

  // -------------------------------------------------------------
  // Scenario 3: Assign inactive developer
  // Expected: Rejected with validation/business error
  // -------------------------------------------------------------
  it('3. Assign inactive developer -> rejected with error', async () => {
    const req = await createNorthwindRequest();

    // Move to Under Review
    await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Under Review', version: req.version });

    // Attempt to assign the inactive developer
    const res = await request(app)
      .post(`/api/requests/${req.id}/assign`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ assigneeId: inactiveDev.id, version: req.version + 1 });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('ASSIGNEE_INACTIVE');
  });

  // -------------------------------------------------------------
  // Scenario 4: Assign developer from another tenant
  // Expected: Rejected
  // -------------------------------------------------------------
  it('4. Assign developer from another tenant -> rejected', async () => {
    const req = await createNorthwindRequest();

    // Move to Under Review
    await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Under Review', version: req.version });

    // Attempt to assign Ruwan (Contoso developer) to Northwind ticket
    const res = await request(app)
      .post(`/api/requests/${req.id}/assign`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ assigneeId: devRuwan.id, version: req.version + 1 });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_ASSIGNEE');
  });

  // -------------------------------------------------------------
  // Scenario 5: Developer attempts self-assignment
  // Expected: Rejected (403 Forbidden)
  // -------------------------------------------------------------
  it('5. Developer attempts self-assignment -> rejected (403)', async () => {
    const req = await createNorthwindRequest();

    // Kamal (developer) attempts to call the assign endpoint
    const res = await request(app)
      .post(`/api/requests/${req.id}/assign`)
      .set('Authorization', `Bearer ${devKamalToken}`)
      .send({ assigneeId: devKamal.id, version: req.version });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  // -------------------------------------------------------------
  // Scenario 6: Invalid status transition
  // Expected: Rejected; status unchanged
  // -------------------------------------------------------------
  it('6. Invalid status transition -> rejected; status unchanged', async () => {
    const req = await createNorthwindRequest(); // Starts in 'Submitted'

    // Attempt invalid jump: Submitted -> Completed directly
    const res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Completed', version: req.version });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TRANSITION');

    // Verify database state: status remains Submitted
    const checkRow = await db('service_requests').where({ id: req.id }).first();
    expect(checkRow.status).toBe('Submitted');
  });

  // -------------------------------------------------------------
  // Scenario 7: Unassigned developer tries completion
  // Expected: Rejected
  // -------------------------------------------------------------
  it('7. Unassigned developer tries completion -> rejected', async () => {
    const req = await createNorthwindRequest();

    // Move to Under Review then Assign to Kamal
    await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Under Review', version: req.version });

    await request(app)
      .post(`/api/requests/${req.id}/assign`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ assigneeId: devKamal.id, version: req.version + 1 });

    // Kamal moves to In Progress
    await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${devKamalToken}`)
      .send({ status: 'In Progress', version: req.version + 2 });

    // Sanduni (not the assignee) attempts to Complete it
    const res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${devSanduniToken}`)
      .send({ status: 'Completed', version: req.version + 3 });

    // Rejected because Sanduni is not the assignee
    expect([403, 404]).toContain(res.status);
  });

  // -------------------------------------------------------------
  // Scenario 8: Concurrent update (Optimistic concurrency)
  // Expected: Conflict detected (409), no silent overwrite
  // -------------------------------------------------------------
  it('8. Concurrent update -> conflict detected (409), no silent overwrite', async () => {
    const req = await createNorthwindRequest();

    // Two updates submitted concurrently with the same starting version
    const [updateA, updateB] = await Promise.all([
      request(app)
        .patch(`/api/requests/${req.id}`)
        .set('Authorization', `Bearer ${northwindManagerToken}`)
        .send({ version: req.version, title: 'Title updated by Manager A' }),
      request(app)
        .patch(`/api/requests/${req.id}`)
        .set('Authorization', `Bearer ${northwindManagerToken}`)
        .send({ version: req.version, title: 'Title updated by Manager B' }),
    ]);

    // Exactly one must succeed (200) and the other must be rejected with 409 Conflict
    const statuses = [updateA.status, updateB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const conflictResponse = updateA.status === 409 ? updateA : updateB;
    expect(conflictResponse.body.error?.code).toBe('VERSION_CONFLICT');
  });

  // -------------------------------------------------------------
  // Scenario 9: Completed request reopened
  // Expected: Allowed for authorized role and audited
  // -------------------------------------------------------------
  it('9. Completed request reopened -> allowed for manager and audited', async () => {
    let req = await createNorthwindRequest();

    // Step 1: Under Review
    let res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Under Review', version: req.version });
    req = res.body.request;

    // Step 2: Assign to Kamal
    res = await request(app)
      .post(`/api/requests/${req.id}/assign`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ assigneeId: devKamal.id, version: req.version });
    req = res.body.request;

    // Step 3: Kamal starts work -> In Progress
    res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${devKamalToken}`)
      .send({ status: 'In Progress', version: req.version });
    req = res.body.request;

    // Step 4: Kamal completes request -> Completed
    res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${devKamalToken}`)
      .send({ status: 'Completed', version: req.version });
    req = res.body.request;
    expect(req.status).toBe('Completed');
    expect(req.completedAt).not.toBeNull();

    // Step 5: Manager reopens with a reason
    const reopenReason = 'Customer verified the bug is not fully resolved';
    res = await request(app)
      .post(`/api/requests/${req.id}/status`)
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({ status: 'Reopened', version: req.version, reason: reopenReason });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('Reopened');
    expect(res.body.request.completedAt).toBeNull(); // completedAt must be cleared

    // Verify audit log has the reopening entry with the reason
    const auditLogs = await db('audit_logs')
      .where({ request_id: req.id, action: 'STATUS_CHANGED' })
      .orderBy('id', 'desc');

    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].reason).toBe(reopenReason);
  });

  // -------------------------------------------------------------
  // Scenario 10: Malformed/empty required input
  // Expected: 400 with useful validation details
  // -------------------------------------------------------------
  it('10. Malformed/empty required input -> 400 with useful validation details', async () => {
    // Send completely empty object
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${northwindManagerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');

    const fields = res.body.error?.details?.fields;
    expect(fields).toBeDefined();
    // Must complain about title, description, priority, category, deadline
    expect(fields).toHaveProperty('title');
    expect(fields).toHaveProperty('description');
    expect(fields).toHaveProperty('priority');
    expect(fields).toHaveProperty('category');
    expect(fields).toHaveProperty('deadline');
  });
});