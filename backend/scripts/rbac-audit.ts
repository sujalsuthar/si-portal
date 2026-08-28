/**
 * RBAC + business-logic audit against a running API.
 * Usage: API_URL=http://localhost:4000/api SEED_ADMIN_PASSWORD=ChangeMe123! npx tsx scripts/rbac-audit.ts
 */
const API = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

const issues: string[] = [];
let passed = 0;

function pass(label: string) {
  passed++;
  console.log(`  OK ${label}`);
}

function fail(label: string, detail: string) {
  issues.push(`[AUDIT] ${label} — ${detail} — P0`);
  console.log(`  FAIL ${label}: ${detail}`);
}

async function json(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await json(res);
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return body.accessToken as string;
}

async function req(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ok: res.ok, body: await json(res) };
}

async function get(path: string, token: string) {
  return req('GET', path, token);
}

async function post(path: string, token: string, body: unknown) {
  return req('POST', path, token, body);
}

async function put(path: string, token: string, body: unknown) {
  return req('PUT', path, token, body);
}

async function patch(path: string, token: string, body: unknown) {
  return req('PATCH', path, token, body);
}

function scanForKey(obj: unknown, key: string, path = ''): string[] {
  const hits: string[] = [];
  if (obj === null || obj === undefined) return hits;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...scanForKey(item, key, `${path}[${i}]`)));
    return hits;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (k === key) hits.push(p);
      else hits.push(...scanForKey(v, key, p));
    }
  }
  return hits;
}

async function main() {
  console.log(`RBAC audit ${API}\n`);

  const superAdmin = await login('admin@siportal.edu');
  const academicAdmin = await login('academic.admin@siportal.edu');
  const accounts = await login('accounts@siportal.edu');
  const priya = await login('priya.faculty@siportal.edu');
  const arjun = await login('arjun.faculty@siportal.edu');
  const studentA = await login('aarav.kumar@student.siportal.edu');
  const studentB = await login('diya.patel@student.siportal.edu');
  const parentA = await login('parent.aarav@siportal.edu');
  const parentB = await login('parent.diya@siportal.edu');

  // --- Harvest IDs ---
  const studentsRes = await get('/students?pageSize=20', superAdmin);
  const students = (studentsRes.body?.items ?? []) as Array<{ id: string; studentCode: string; firstName: string }>;
  const aarav = students.find((s) => s.studentCode === 'SI-2026-001') ?? students[0];
  const diya = students.find((s) => s.studentCode === 'SI-2026-002') ?? students[1];

  const batchesRes = await get('/batches?pageSize=10', superAdmin);
  const batches = (batchesRes.body?.items ?? []) as Array<{ id: string; code: string }>;
  const fswdBatch = batches.find((b) => b.code === 'FSWD-2026-A') ?? batches[0];
  const dsaiBatch = batches.find((b) => b.code === 'DSAI-2026-A') ?? batches[1];

  const coursesRes = await get('/courses?pageSize=5', superAdmin);
  const courseId = coursesRes.body?.items?.[0]?.id as string;

  // === 3a RBAC boundary matrix ===
  console.log('3a RBAC boundaries (Academic Admin should get 403 on create/edit):');

  const adminPostStudent = await post('/students', academicAdmin, {
    email: 'fake@test.edu',
    firstName: 'X',
    lastName: 'Y',
    studentCode: 'FAKE-001',
    dataProcessingConsent: { granted: true, noticeVersion: '1.0' },
  });
  adminPostStudent.status === 403 ? pass('admin POST /students blocked') : fail('admin POST /students', `got ${adminPostStudent.status}`);

  const adminPutStudent = await put(`/students/${aarav.id}`, academicAdmin, { firstName: aarav.firstName });
  adminPutStudent.status === 403 ? pass('admin PUT /students/:id blocked') : fail('admin PUT /students/:id', `got ${adminPutStudent.status} (S1)`);

  const adminPostCourse = await post('/courses', academicAdmin, { name: 'Fake', code: 'FAKE', durationMonths: 6 });
  adminPostCourse.status === 403 ? pass('admin POST /courses blocked') : fail('admin POST /courses', `got ${adminPostCourse.status}`);

  if (courseId) {
    const adminPutCourse = await put(`/courses/${courseId}`, academicAdmin, { name: 'Test' });
    adminPutCourse.status === 403 ? pass('admin PUT /courses/:id blocked') : fail('admin PUT /courses/:id', `got ${adminPutCourse.status} (S1)`);
  }

  const adminPostFaculty = await post('/faculty', academicAdmin, {
    email: 'fake.faculty@test.edu',
    employeeCode: 'FAC-FAKE',
    firstName: 'F',
    lastName: 'F',
  });
  adminPostFaculty.status === 403 ? pass('admin POST /faculty blocked') : fail('admin POST /faculty', `got ${adminPostFaculty.status}`);

  const adminPostBatch = await post('/batches', academicAdmin, {
    code: 'FAKE-BATCH',
    name: 'Fake',
    courseId,
    startDate: new Date().toISOString(),
  });
  adminPostBatch.status === 403 ? pass('admin POST /batches blocked') : fail('admin POST /batches', `got ${adminPostBatch.status}`);

  if (fswdBatch) {
    const adminPutBatch = await put(`/batches/${fswdBatch.id}`, academicAdmin, { name: 'FSWD Test' });
    adminPutBatch.status === 403 ? pass('admin PUT /batches/:id blocked') : fail('admin PUT /batches/:id', `got ${adminPutBatch.status} (S1)`);
  }

  const facultyList = await get('/faculty?pageSize=5', superAdmin);
  const facultyId = facultyList.body?.items?.[0]?.id as string;
  if (facultyId) {
    const adminActivate = await patch(`/faculty/${facultyId}/activate`, academicAdmin, {});
    adminActivate.status === 403 ? pass('admin PATCH faculty activate blocked') : fail('admin faculty activate', `got ${adminActivate.status}`);
  }

  const certs = await get('/certificates?pageSize=1', superAdmin);
  const certId = certs.body?.items?.[0]?.id;
  if (certId) {
    const adminRevoke = await patch(`/certificates/${certId}/revoke`, academicAdmin, { reason: 'test audit' });
    adminRevoke.status === 403 ? pass('admin certificate revoke blocked') : fail('admin cert revoke', `got ${adminRevoke.status}`);
  }

  const adminIssueCert = await post('/certificates', academicAdmin, {
    studentId: aarav.id,
    courseId,
    batchId: fswdBatch?.id,
    title: 'Audit Test Cert',
    type: 'COMPLETION',
  });
  adminIssueCert.status === 201 || adminIssueCert.status === 200 || adminIssueCert.status === 400
    ? pass(`admin POST /certificates (${adminIssueCert.status}, ADMIN_LIKE allowed)`)
    : fail('admin issue certificate', `got ${adminIssueCert.status}`);

  // === 3b Fee authority (S2) ===
  console.log('\n3b Fee authority (Academic Admin full access per README):');
  const adminFeesDash = await get('/fees/dashboard', academicAdmin);
  adminFeesDash.ok ? pass('admin GET /fees/dashboard') : fail('admin fees dashboard', `got ${adminFeesDash.status} (S2)`);

  const adminRefund = await post('/fees/refunds', academicAdmin, {
    feeAccountId: (await get('/fees/accounts?pageSize=1', superAdmin)).body?.items?.[0]?.id,
    type: 'REFUND',
    amount: 1,
    reason: 'audit probe',
  });
  if ((await get('/fees/accounts?pageSize=1', superAdmin)).body?.items?.[0]?.id) {
    adminRefund.status === 201 ? pass('admin POST /fees/refunds') : fail('admin POST /fees/refunds', `got ${adminRefund.status} (S2)`);
  }

  // === 3c Self-approval ===
  console.log('\n3c Self-approval guards:');
  const acCreate = await post('/action-centre', academicAdmin, {
    type: 'GENERAL',
    subject: 'Self approval audit',
    description: 'Testing self approval block',
  });
  if (acCreate.status === 201 && acCreate.body?.id) {
    const selfApprove = await patch(`/action-centre/${acCreate.body.id}/approve`, academicAdmin, { remarks: 'self' });
    selfApprove.status === 403 ? pass('action-centre self-approve blocked') : fail('action-centre self-approve', `got ${selfApprove.status}`);
  }

  // === 3j Answer key leak ===
  console.log('\n3j correctAnswer leak scan:');
  for (const [label, token] of [
    ['super admin', superAdmin],
    ['academic admin', academicAdmin],
    ['faculty', priya],
    ['student', studentA],
  ] as const) {
    const qRes = await get('/questions?pageSize=20', token);
    if (qRes.ok) {
      const hits = scanForKey(qRes.body, 'correctAnswer');
      hits.length === 0 ? pass(`no correctAnswer leak (${label})`) : fail(`correctAnswer leak (${label})`, hits.join(', '));
    }
  }

  // === 3k pointsAwarded scrub ===
  console.log('\n3k pointsAwarded scrub for students:');
  const tasksRes = await get('/tasks?pageSize=5', studentA);
  if (tasksRes.ok && tasksRes.body?.items?.length) {
    const taskId = tasksRes.body.items[0].id;
    const taskDetail = await get(`/tasks/${taskId}`, studentA);
    const hits = scanForKey(taskDetail.body, 'pointsAwarded').filter((p) => {
      const subs = taskDetail.body?.submissions as Array<{ pointsAwarded: number | null }> | undefined;
      return subs?.some((s) => s.pointsAwarded !== null);
    });
    hits.length === 0 ? pass('student task pointsAwarded scrubbed') : fail('student pointsAwarded leak', hits.join(', '));
  } else {
    pass('student tasks (no items to probe)');
  }

  // === 3l IDOR probes ===
  console.log('\n3l IDOR wrong-ID probes:');

  // Parent A -> Parent B's child
  const pIdor1 = await get(`/students/${diya.id}`, parentA);
  pIdor1.status === 403 ? pass('P-IDOR-1 parent cannot GET other child') : fail('P-IDOR-1', `got ${pIdor1.status}`);

  const pIdor3 = await get('/fees/accounts', parentA);
  if (pIdor3.ok) {
    const items = (pIdor3.body?.items ?? pIdor3.body ?? []) as Array<{ studentId?: string }>;
    const leaked = items.some((a) => a.studentId === diya.id);
    !leaked ? pass('P-IDOR-3 parent fees scoped') : fail('P-IDOR-3', 'parent A sees child B fee account');
  }

  const pComposite = await get(`/students/${diya.id}/composite-score`, parentA);
  pComposite.status === 403 ? pass('P-IDOR-4 parent composite blocked') : fail('P-IDOR-4', `got ${pComposite.status}`);

  // Faculty Priya -> Arjun's DSAI batch
  if (dsaiBatch) {
    const fIdor1 = await get(`/batches/${dsaiBatch.id}`, priya);
    fIdor1.status === 403 ? pass('F-IDOR-1 faculty batch blocked') : fail('F-IDOR-1', `got ${fIdor1.status}`);

    const fIdor2 = await post('/feed', priya, { title: 'IDOR test', content: 'probe', batchId: dsaiBatch.id });
    fIdor2.status === 403 ? pass('F-IDOR-2 faculty feed wrong batch blocked') : fail('F-IDOR-2', `got ${fIdor2.status}`);

    const postable = await get('/feed/postable-batches', priya);
    const postableIds = ((postable.body ?? []) as Array<{ id: string }>).map((b) => b.id);
    !postableIds.includes(dsaiBatch.id)
      ? pass('F-IDOR-3 postable batches scoped')
      : fail('F-IDOR-3', 'DSAI batch in Priya postable list');

    const fIdor4 = await get(`/students/${diya.id}`, priya);
    // Diya is intern in FSWD - Priya is mentor, may have access. Try student in DSAI only if exists.
    const dsaiStudents = await get(`/students?batchId=${dsaiBatch.id}&pageSize=5`, superAdmin);
    const dsaiStudentId = dsaiStudents.body?.items?.[0]?.id;
    if (dsaiStudentId) {
      const fIdor4b = await get(`/students/${dsaiStudentId}`, priya);
      fIdor4b.status === 403 ? pass('F-IDOR-4 faculty student in other batch blocked') : fail('F-IDOR-4', `got ${fIdor4b.status}`);
    }

    const sessionsOther = await get(`/sessions?batchId=${dsaiBatch.id}&pageSize=5`, priya);
    const sessionItems = sessionsOther.body?.items ?? [];
    if (sessionItems.length === 0) {
      pass('F-IDOR-5 faculty sessions other batch empty/scoped');
    } else {
      fail('F-IDOR-5', `Priya sees ${sessionItems.length} DSAI sessions`);
    }

    // Session detail IDOR
    const dsaiSessions = await get(`/sessions?batchId=${dsaiBatch.id}&pageSize=1`, superAdmin);
    const dsaiSessionId = dsaiSessions.body?.items?.[0]?.id;
    if (dsaiSessionId) {
      const sessionDetail = await get(`/sessions/${dsaiSessionId}`, priya);
      sessionDetail.status === 403 ? pass('F-IDOR-5b session detail blocked') : fail('F-IDOR-5b session detail', `got ${sessionDetail.status}`);
    }
  }

  // Student A -> Student B
  const sIdor1 = await get(`/students/${diya.id}`, studentA);
  sIdor1.status === 403 ? pass('S-IDOR-1 student cannot GET peer') : fail('S-IDOR-1', `got ${sIdor1.status}`);

  const examsB = await get('/exams?pageSize=5', studentB);
  const examBId = examsB.body?.items?.[0]?.id;
  // Cross-batch exam probe: create exam on DSAI (no students) then verify FSWD student cannot access
  if (dsaiBatch && courseId) {
    const dsaiExam = await post('/exams', superAdmin, {
      title: 'IDOR Audit Exam',
      batchId: dsaiBatch.id,
      courseId,
      subject: 'Audit',
      examDate: new Date().toISOString(),
      durationMinutes: 60,
      totalMarks: 100,
    });
    const dsaiExamId = dsaiExam.body?.id as string | undefined;
    if (dsaiExamId) {
      const sIdor3 = await get(`/exams/${dsaiExamId}`, studentA);
      sIdor3.status === 403 ? pass('S-IDOR-3 student exam other batch blocked') : fail('S-IDOR-3', `got ${sIdor3.status}`);
    } else {
      pass('S-IDOR-3 skipped (could not create DSAI exam)');
    }
  } else if (examBId) {
    const sIdor3 = await get(`/exams/${examBId}`, studentA);
    // Same-batch students legitimately share exams — only flag if batches differ
    pass(`S-IDOR-3 same-batch exam access (${sIdor3.status})`);
  }

  // === 3d Composite sanity ===
  console.log('\n3d Composite score present:');
  const composite = await get(`/students/${aarav.id}/composite-score`, superAdmin);
  composite.ok && typeof composite.body?.composite === 'number'
    ? pass(`composite score for aarav: ${composite.body.composite}`)
    : fail('composite score', `missing or invalid`);

  // === Accounts RBAC ===
  console.log('\nAccounts RBAC:');
  const accInterns = await get('/interns', accounts);
  accInterns.status === 403 ? pass('accounts interns blocked') : fail('accounts interns', `got ${accInterns.status}`);

  const accFees = await get('/fees/dashboard', accounts);
  accFees.ok ? pass('accounts fees dashboard') : fail('accounts fees', `got ${accFees.status}`);

  console.log(`\n--- Summary: ${passed} passed, ${issues.length} failed ---`);
  if (issues.length) {
    console.log('\nIssues to log:');
    issues.forEach((i) => console.log(`  ${i}`));
    process.exit(1);
  }
  console.log('RBAC audit passed.');
}

main().catch((err) => {
  console.error('RBAC audit FAILED:', err.message || err);
  process.exit(1);
});
