import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { db } from '../db';

// Checks service requests (create, list, view, edit, filters, pagination, sorting, isolation)
// against a real running copy of the API. It creates temporary requests (titles starting with
// "Check Requests") and removes them, and their audit entries, at the end.
// Run it with: npm run check:requests

let passed = 0;
let failed = 0;
let baseUrl = '';

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

type Reply = { status: number; body: any };

async function api(method: string, path: string, options: { token?: string; json?: unknown } = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function expectError(reply: Reply, status: number, code: string, label: string): void {
  check(reply.status === status && reply.body?.error?.code === code, label, `got ${reply.status} ${reply.body?.error?.code}`);
}

function expectFields(reply: Reply, fields: string[], label: string): void {
  const details = reply.body?.error?.details?.fields ?? {};
  check(reply.status === 400 && fields.every((f) => !!details[f]), label, `got ${reply.status} ${JSON.stringify(details)}`);
}

async function loginAs(email: string, password: string): Promise<string> {
  const reply = await api('POST', '/api/auth/login', { json: { email, password } });
  if (reply.status !== 200) {
    throw new Error(`Could not log in as ${email} (status ${reply.status}). Did you run npm run db:seed?`);
  }
  return reply.body.token;
}

async function cleanup(): Promise<void> {
  const rows = await db('service_requests').select('id').where('title', 'like', 'Check Requests%');
  const ids = rows.map((r: { id: number }) => r.id);
  if (ids.length > 0) {
    await db('audit_logs').whereIn('request_id', ids).del();
    await db('service_requests').whereIn('id', ids).del();
  }
  // The reference counter was used by our temporary requests. If no real request exists yet, start it again.
  const left = await db('service_requests').count({ total: '*' }).first();
  if (Number(left?.total ?? 0) === 0) {
    await db.raw('ALTER SEQUENCE service_request_number_seq RESTART WITH 1');
  }
}

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim();
  if (!password) {
    throw new Error('SEED_PASSWORD is missing in backend/.env.');
  }

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await cleanup();

  const user = async (email: string) => {
    const row = await db('users').where({ email }).first();
    if (!row) throw new Error(`Demo user ${email} not found. Run: npm run db:seed`);
    return row;
  };
  const northwind = await db('organizations').where({ name: 'Northwind Traders' }).first();
  const contoso = await db('organizations').where({ name: 'Contoso Ltd' }).first();
  const nimal = await user('nimal.manager@northwind.test');
  const kamal = await user('kamal.dev@northwind.test');
  const sanduni = await user('sanduni.dev@northwind.test');

  try {
    console.log('Checking service requests...');

    const managerToken = await loginAs('nimal.manager@northwind.test', password);
    const otherManagerToken = await loginAs('ayesha.manager@contoso.test', password);
    const developerToken = await loginAs('kamal.dev@northwind.test', password);
    const otherDeveloperToken = await loginAs('sanduni.dev@northwind.test', password);
    const contosoDeveloperToken = await loginAs('ruwan.dev@contoso.test', password);
    const adminToken = await loginAs('admin@servicedesk.test', password);

    const valid = (overrides: Record<string, unknown> = {}) => ({
      title: 'Check Requests sample',
      description: 'Created by the check script',
      priority: 'Medium',
      category: 'Bug Fix',
      deadline: inDays(7),
      ...overrides,
    });
    const create = (token: string, overrides: Record<string, unknown> = {}) =>
      api('POST', '/api/requests', { token, json: valid(overrides) });

    // ---- Creating ----
    console.log('\nCreating requests');
    expectError(await api('POST', '/api/requests', { json: valid() }), 401, 'UNAUTHENTICATED', 'No token is refused (401)');
    expectError(await create(developerToken), 403, 'FORBIDDEN', 'A developer cannot create a request (403)');
    expectError(await create(adminToken), 403, 'FORBIDDEN', 'The System Admin cannot create a request (403)');

    const first = await create(managerToken, { title: 'Check Requests first' });
    const firstRequest = first.body?.request;
    check(first.status === 201 && /^SR-\d{6,}$/.test(firstRequest?.referenceNumber), 'Manager creates a request (201) with an automatic reference number');
    check(firstRequest?.status === 'Submitted' && firstRequest?.version === 1 && firstRequest?.assignee === null, 'It starts as Submitted, version 1, with no assignee');
    check(firstRequest?.organizationId === northwind.id && firstRequest?.createdBy?.id === nimal.id, "It belongs to the manager's organization and records the creator");
    check(firstRequest?.isOverdue === false, 'A request with a future deadline is not overdue');

    const forged = await create(managerToken, {
      title: 'Check Requests forged',
      organizationId: contoso.id,
      status: 'Completed',
      assigneeId: kamal.id,
      assignee: { id: kamal.id },
      createdBy: 9999,
      referenceNumber: 'SR-999999',
      version: 99,
    });
    const forgedRequest = forged.body?.request;
    check(
      forged.status === 201 && forgedRequest?.organizationId === northwind.id && forgedRequest?.status === 'Submitted' && forgedRequest?.assignee === null && forgedRequest?.createdBy?.id === nimal.id && forgedRequest?.referenceNumber !== 'SR-999999' && forgedRequest?.version === 1,
      'Forged organizationId, status, assignee, creator, reference number and version in the body are all ignored'
    );
    check(firstRequest?.referenceNumber !== forgedRequest?.referenceNumber, 'Every request gets its own reference number');

    const createdAudit = await db('audit_logs').where({ request_id: firstRequest?.id, action: 'REQUEST_CREATED' }).first();
    check(
      createdAudit?.actor_id === nimal.id && createdAudit?.organization_id === northwind.id && createdAudit?.new_value?.status === 'Submitted' && createdAudit?.target_user_id === null,
      'Creation wrote an audit entry (actor, organization, new values)'
    );

    expectFields(await api('POST', '/api/requests', { token: managerToken, json: {} }), ['title', 'description', 'priority', 'category', 'deadline'], 'Empty body returns 400 with details for every required field');
    expectFields(await create(managerToken, { priority: 'Urgent' }), ['priority'], 'Invalid priority returns 400');
    expectFields(await create(managerToken, { category: 'Cooking' }), ['category'], 'Invalid category returns 400');
    expectFields(await create(managerToken, { title: '   ' }), ['title'], 'Blank title returns 400');
    expectFields(await create(managerToken, { title: 'x'.repeat(201) }), ['title'], 'A title over 200 characters returns 400');
    expectFields(await create(managerToken, { deadline: '2026-12-01T09:00:00' }), ['deadline'], 'A deadline without a time zone returns 400');
    expectFields(await create(managerToken, { deadline: '2026-02-31T09:00:00Z' }), ['deadline'], 'An impossible date (31 February) returns 400');
    expectFields(await create(managerToken, { deadline: 'tomorrow' }), ['deadline'], 'A deadline that is not a date returns 400');

    const late = await create(managerToken, { title: 'Check Requests overdue', deadline: inDays(-2) });
    check(late.status === 201 && late.body?.request?.isOverdue === true, 'A request whose deadline has passed is flagged as overdue');
    const zone = await create(managerToken, { title: 'Check Requests zone', deadline: '2030-01-01T09:00:00+05:30' });
    check(zone.status === 201 && zone.body?.request?.deadline === '2030-01-01T03:30:00.000Z', 'A deadline with a time zone offset is stored as the exact moment (UTC)');

    // ---- Data for listing (all in Northwind) ----
    const r1 = (await create(managerToken, { title: 'Check Requests R1', priority: 'Low', deadline: inDays(10) })).body.request;
    const r2 = (await create(managerToken, { title: 'Check Requests R2', priority: 'High', deadline: inDays(3) })).body.request;
    const r3 = (await create(managerToken, { title: 'Check Requests R3', priority: 'Critical', deadline: inDays(5) })).body.request;
    const r4 = (await create(managerToken, { title: 'Check Requests R4', priority: 'High', deadline: inDays(1) })).body.request;
    const r5 = (await create(managerToken, { title: 'Check Requests R5', priority: 'Medium', deadline: inDays(7) })).body.request;
    const mine = new Set<number>([firstRequest.id, forgedRequest.id, late.body.request.id, zone.body.request.id, r1.id, r2.id, r3.id, r4.id, r5.id]);
    const onlyMine = (reply: Reply) => (reply.body?.requests ?? []).filter((r: any) => mine.has(r.id));
    const ids = (list: any[]) => list.map((r: any) => r.id);

    // The assignment endpoint does not exist yet, so we assign directly in the database for these checks.
    await db('service_requests').whereIn('id', [r2.id, r3.id]).update({ assignee_id: kamal.id, status: 'Assigned' });
    await db('service_requests').where({ id: r4.id }).update({ assignee_id: sanduni.id, status: 'Assigned' });

    // ---- Listing, filters ----
    console.log('\nListing and filters (Manager)');
    expectError(await api('GET', '/api/requests'), 401, 'UNAUTHENTICATED', 'No token is refused (401)');
    expectError(await api('GET', '/api/requests', { token: adminToken }), 403, 'FORBIDDEN', 'The System Admin cannot list requests (403)');

    const all = await api('GET', '/api/requests?limit=100', { token: managerToken });
    const northwindTotal = Number((await db('service_requests').where({ organization_id: northwind.id }).count({ total: '*' }).first())?.total);
    check(all.status === 200 && all.body?.pagination?.total === northwindTotal && onlyMine(all).length === mine.size, 'Manager lists all requests of their organization');

    const byStatus = await api('GET', '/api/requests?status=Assigned&limit=100', { token: managerToken });
    check(byStatus.body?.requests?.every((r: any) => r.status === 'Assigned') && ids(onlyMine(byStatus)).sort().join() === [r2.id, r3.id, r4.id].sort().join(), 'Filter by status');

    const byPriority = await api('GET', '/api/requests?priority=High&limit=100', { token: managerToken });
    check(byPriority.body?.requests?.every((r: any) => r.priority === 'High') && ids(onlyMine(byPriority)).sort().join() === [r2.id, r4.id].sort().join(), 'Filter by priority');

    const byAssignee = await api('GET', `/api/requests?assigneeId=${kamal.id}&limit=100`, { token: managerToken });
    check(byAssignee.body?.requests?.every((r: any) => r.assignee?.id === kamal.id) && ids(onlyMine(byAssignee)).sort().join() === [r2.id, r3.id].sort().join(), 'Filter by assignee');

    const byDeadline = await api('GET', `/api/requests?deadlineFrom=${encodeURIComponent(inDays(2))}&deadlineTo=${encodeURIComponent(inDays(6))}&limit=100`, { token: managerToken });
    check(ids(onlyMine(byDeadline)).sort().join() === [r2.id, r3.id].sort().join(), 'Filter by deadline range');

    const createdAfter = await api('GET', `/api/requests?createdFrom=${encodeURIComponent(inDays(-1))}&limit=100`, { token: managerToken });
    const createdBefore = await api('GET', `/api/requests?createdTo=${encodeURIComponent(inDays(-1))}&limit=100`, { token: managerToken });
    check(onlyMine(createdAfter).length === mine.size && onlyMine(createdBefore).length === 0, 'Filter by created date range');

    const combined = await api('GET', `/api/requests?status=Assigned&priority=High&assigneeId=${sanduni.id}&limit=100`, { token: managerToken });
    check(ids(onlyMine(combined)).join() === String(r4.id), 'Filters can be combined');

    expectFields(await api('GET', '/api/requests?status=Finished', { token: managerToken }), ['status'], 'Invalid status filter returns 400');
    expectFields(await api('GET', '/api/requests?priority=Urgent', { token: managerToken }), ['priority'], 'Invalid priority filter returns 400');
    expectFields(await api('GET', '/api/requests?assigneeId=abc', { token: managerToken }), ['assigneeId'], 'Invalid assignee filter returns 400');
    expectFields(await api('GET', '/api/requests?deadlineFrom=2026-12-01', { token: managerToken }), ['deadlineFrom'], 'A filter date without time and time zone returns 400');

    // ---- Sorting and pagination ----
    console.log('\nSorting and pagination');
    const byDeadlineAsc = await api('GET', '/api/requests?sortBy=deadline&sortOrder=asc&limit=100', { token: managerToken });
    const deadlinesAsc = onlyMine(byDeadlineAsc).map((r: any) => new Date(r.deadline).getTime());
    check(deadlinesAsc.length === mine.size && deadlinesAsc.every((t: number, i: number) => i === 0 || deadlinesAsc[i - 1] <= t), 'Sort by deadline, ascending');
    const byDeadlineDesc = await api('GET', '/api/requests?sortBy=deadline&sortOrder=desc&limit=100', { token: managerToken });
    const deadlinesDesc = onlyMine(byDeadlineDesc).map((r: any) => new Date(r.deadline).getTime());
    check(deadlinesDesc.every((t: number, i: number) => i === 0 || deadlinesDesc[i - 1] >= t), 'Sort by deadline, descending');

    const rank: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
    const byPriorityDesc = await api('GET', '/api/requests?sortBy=priority&sortOrder=desc&limit=100', { token: managerToken });
    const ranks = onlyMine(byPriorityDesc).map((r: any) => rank[r.priority]);
    check(ranks.every((v: number, i: number) => i === 0 || ranks[i - 1] >= v) && ranks[0] === 4, 'Sort by priority follows its meaning (Critical first), not the alphabet');

    const defaultSort = await api('GET', '/api/requests?limit=100', { token: managerToken });
    const created = onlyMine(defaultSort).map((r: any) => new Date(r.createdAt).getTime());
    check(created.every((t: number, i: number) => i === 0 || created[i - 1] >= t), 'Default order is newest first');

    // Page through everything with a small page size, sorted by a field with many ties (priority).
    const reference = await api('GET', '/api/requests?sortBy=priority&sortOrder=desc&limit=100', { token: managerToken });
    const collected: number[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const reply = await api('GET', `/api/requests?sortBy=priority&sortOrder=desc&limit=3&page=${page}`, { token: managerToken });
      totalPages = reply.body?.pagination?.totalPages ?? 1;
      collected.push(...ids(reply.body?.requests ?? []));
      page += 1;
    } while (page <= totalPages);
    check(collected.length === northwindTotal && new Set(collected).size === northwindTotal, 'Paging returns every request exactly once (no duplicates, none missing)');
    check(collected.join() === ids(reference.body?.requests ?? []).join(), 'The order is the same on every page, even for requests with the same priority (deterministic)');

    const smallPage = await api('GET', '/api/requests?limit=2&page=2', { token: managerToken });
    check(
      smallPage.body?.pagination?.page === 2 && smallPage.body?.pagination?.limit === 2 && smallPage.body?.pagination?.total === northwindTotal && smallPage.body?.pagination?.totalPages === Math.ceil(northwindTotal / 2) && smallPage.body?.requests?.length === 2,
      'Pagination details are correct (page, limit, total, totalPages)'
    );
    const beyond = await api('GET', '/api/requests?page=9999', { token: managerToken });
    check(beyond.status === 200 && beyond.body?.requests?.length === 0, 'A page beyond the end returns an empty list');
    expectFields(await api('GET', '/api/requests?page=0', { token: managerToken }), ['page'], 'page=0 returns 400');
    expectFields(await api('GET', '/api/requests?limit=101', { token: managerToken }), ['limit'], 'limit above 100 returns 400');
    expectFields(await api('GET', '/api/requests?sortBy=password', { token: managerToken }), ['sortBy'], 'An unknown sort field returns 400');
    expectFields(await api('GET', '/api/requests?sortOrder=sideways', { token: managerToken }), ['sortOrder'], 'An unknown sort order returns 400');

    // ---- Developer visibility ----
    console.log('\nDeveloper visibility');
    const kamalList = await api('GET', '/api/requests?limit=100', { token: developerToken });
    check(kamalList.status === 200 && kamalList.body?.requests?.every((r: any) => r.assignee?.id === kamal.id) && ids(onlyMine(kamalList)).sort().join() === [r2.id, r3.id].sort().join(), 'A developer sees ONLY the requests assigned to them');
    const widen = await api('GET', `/api/requests?assigneeId=${sanduni.id}&limit=100`, { token: developerToken });
    check(widen.status === 200 && widen.body?.requests?.length === 0, "A developer cannot widen the list by filtering on someone else's requests");
    const detailOwn = await api('GET', `/api/requests/${r2.id}`, { token: developerToken });
    check(detailOwn.status === 200 && detailOwn.body?.request?.assignee?.name === 'Kamal Silva', 'A developer can open a request assigned to them');
    expectError(await api('GET', `/api/requests/${r1.id}`, { token: developerToken }), 404, 'NOT_FOUND', 'A developer cannot open an unassigned request (404)');
    expectError(await api('GET', `/api/requests/${r4.id}`, { token: developerToken }), 404, 'NOT_FOUND', "A developer cannot open a colleague's request (404)");
    expectError(await api('GET', `/api/requests/${r2.id}`, { token: otherDeveloperToken }), 404, 'NOT_FOUND', 'Another developer of the same organization gets 404');
    expectError(await api('GET', `/api/requests/${r2.id}`, { token: contosoDeveloperToken }), 404, 'NOT_FOUND', 'A developer of another organization gets 404');
    expectError(await api('PATCH', `/api/requests/${r2.id}`, { token: developerToken, json: { version: 1, title: 'Check Requests hacked' } }), 403, 'FORBIDDEN', 'A developer cannot edit a request (403)');

    // ---- Organization isolation ----
    console.log('\nOrganization isolation');
    const contosoRequest = (await create(otherManagerToken, { title: 'Check Requests Contoso' })).body?.request;
    check(contosoRequest?.organizationId === contoso.id, 'A Contoso manager creates a request in Contoso');
    const northwindSees = await api('GET', '/api/requests?limit=100', { token: managerToken });
    const contosoSees = await api('GET', '/api/requests?limit=100', { token: otherManagerToken });
    check(!ids(northwindSees.body?.requests ?? []).includes(contosoRequest?.id) && !(contosoSees.body?.requests ?? []).some((r: any) => mine.has(r.id)), 'Each manager sees only their own organization in lists');
    expectError(await api('GET', `/api/requests/${contosoRequest?.id}`, { token: managerToken }), 404, 'NOT_FOUND', "A manager cannot open another organization's request (404)");
    expectError(await api('GET', `/api/requests/${r1.id}`, { token: otherManagerToken }), 404, 'NOT_FOUND', "Nor the other way round (404)");
    expectError(await api('PATCH', `/api/requests/${contosoRequest?.id}`, { token: managerToken, json: { version: 1, title: 'Check Requests hijacked' } }), 404, 'NOT_FOUND', "A manager cannot edit another organization's request (404)");
    check((await db('service_requests').where({ id: contosoRequest?.id }).first())?.title === 'Check Requests Contoso', "The other organization's request is unchanged");
    const forgedQuery = await api('GET', `/api/requests?organizationId=${contoso.id}&limit=100`, { token: managerToken });
    check(forgedQuery.status === 200 && (forgedQuery.body?.requests ?? []).every((r: any) => r.organizationId === northwind.id), 'A forged organizationId in the query is ignored');
    expectError(await api('GET', `/api/requests/${r1.id}`, { token: adminToken }), 403, 'FORBIDDEN', 'The System Admin cannot read request content (403)');
    expectError(await api('GET', '/api/requests/abc', { token: managerToken }), 400, 'VALIDATION_ERROR', 'A non-numeric id returns 400');
    expectError(await api('GET', '/api/requests/999999999', { token: managerToken }), 404, 'NOT_FOUND', 'An unknown id returns 404');

    // ---- Editing and version checks ----
    console.log('\nEditing and concurrency');
    const edited = await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 1, title: 'Check Requests R1 edited', priority: 'High', category: 'New Feature', description: 'New text', deadline: inDays(12) } });
    check(edited.status === 200 && edited.body?.request?.title === 'Check Requests R1 edited' && edited.body?.request?.priority === 'High' && edited.body?.request?.category === 'New Feature' && edited.body?.request?.description === 'New text', 'Manager edits title, description, priority, category and deadline');
    check(edited.body?.request?.version === 2 && new Date(edited.body?.request?.updatedAt) > new Date(r1.updatedAt), 'The version goes up and updatedAt changes');
    check(edited.body?.request?.status === 'Submitted' && edited.body?.request?.referenceNumber === r1.referenceNumber, 'Status and reference number are untouched');

    const stale = await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 1, title: 'Check Requests stale write' } });
    check(stale.status === 409 && stale.body?.error?.code === 'VERSION_CONFLICT' && stale.body?.error?.details?.currentVersion === 2, 'Editing with an old version is refused (409) and tells you the current version');
    check((await db('service_requests').where({ id: r1.id }).first())?.title === 'Check Requests R1 edited', 'The stale edit overwrote nothing');

    expectFields(await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { title: 'Check Requests no version' } }), ['version'], 'Editing without a version returns 400');
    const onlyForbidden = await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 2, status: 'Completed', assigneeId: kamal.id, organizationId: contoso.id } });
    check(onlyForbidden.status === 400, 'A body with only non-editable fields returns 400');
    const mixed = await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 2, title: 'Check Requests R1 mixed', status: 'Completed', assigneeId: kamal.id, organizationId: contoso.id } });
    check(mixed.status === 200 && mixed.body?.request?.status === 'Submitted' && mixed.body?.request?.assignee === null && mixed.body?.request?.organizationId === northwind.id && mixed.body?.request?.title === 'Check Requests R1 mixed', 'Status, assignee and organization in an edit are ignored');
    expectFields(await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 3, priority: 'Urgent' } }), ['priority'], 'Invalid priority in an edit returns 400');
    expectFields(await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 3, title: '' } }), ['title'], 'A blank title in an edit returns 400');
    expectFields(await api('PATCH', `/api/requests/${r1.id}`, { token: managerToken, json: { version: 3, deadline: 'soon' } }), ['deadline'], 'An invalid deadline in an edit returns 400');

    // Two edits at the same moment with the same version: exactly one wins, nothing is silently overwritten.
    const raceStart = (await api('GET', `/api/requests/${r5.id}`, { token: managerToken })).body.request;
    const [raceA, raceB] = await Promise.all([
      api('PATCH', `/api/requests/${r5.id}`, { token: managerToken, json: { version: raceStart.version, title: 'Check Requests R5 from A' } }),
      api('PATCH', `/api/requests/${r5.id}`, { token: managerToken, json: { version: raceStart.version, title: 'Check Requests R5 from B' } }),
    ]);
    check([raceA.status, raceB.status].sort().join() === '200,409', 'Two simultaneous edits with the same version: one succeeds, the other gets 409');
    check((await api('GET', `/api/requests/${r5.id}`, { token: managerToken })).body.request.version === raceStart.version + 1, 'The version went up exactly once');

    // A Completed request cannot be edited, and is never overdue.
    await db('service_requests').where({ id: r3.id }).update({ status: 'Completed', completed_at: new Date(), deadline: new Date(Date.now() - 3 * DAY) });
    const completed = await api('GET', `/api/requests/${r3.id}`, { token: managerToken });
    check(completed.body?.request?.status === 'Completed' && completed.body?.request?.isOverdue === false, 'A Completed request past its deadline is not overdue');
    expectError(await api('PATCH', `/api/requests/${r3.id}`, { token: managerToken, json: { version: completed.body.request.version, title: 'Check Requests edit after completion' } }), 409, 'REQUEST_COMPLETED', 'A Completed request cannot be edited (409)');
    check((await db('service_requests').where({ id: r3.id }).first())?.title === 'Check Requests R3', 'The Completed request is unchanged');
    await db('service_requests').where({ id: r3.id }).update({ status: 'Reopened', completed_at: null });
    const reopened = await api('GET', `/api/requests/${r3.id}`, { token: managerToken });
    check(reopened.body?.request?.status === 'Reopened' && reopened.body?.request?.isOverdue === true, 'A Reopened request past its deadline is overdue again');
  } finally {
    await cleanup();
    server.close();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nThe check script crashed:', error.message);
  try {
    await cleanup();
  } catch {
    // ignore cleanup problems while reporting the real error
  }
  await db.destroy();
  process.exit(1);
});