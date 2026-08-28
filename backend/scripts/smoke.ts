/**

 * Demo smoke checks against a running API (local or Docker).

 * Usage: API_URL=http://localhost:4000/api SEED_ADMIN_PASSWORD=ChangeMe123! npm run smoke

 */

const API = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';



const accounts = [

  { role: 'SUPER_ADMIN', email: 'admin@siportal.edu' },

  { role: 'MANAGEMENT', email: 'management@siportal.edu' },

  { role: 'ACADEMIC_ADMIN', email: 'academic.admin@siportal.edu' },

  { role: 'ACCOUNTS', email: 'accounts@siportal.edu' },

  { role: 'FACULTY', email: 'priya.faculty@siportal.edu' },

  { role: 'STUDENT', email: 'aarav.kumar@student.siportal.edu' },

  { role: 'PARENT', email: 'parent.aarav@siportal.edu' },

];



async function json(res: Response) {

  const text = await res.text();

  try {

    return text ? JSON.parse(text) : null;

  } catch {

    return text;

  }

}



async function login(email: string) {

  const res = await fetch(`${API}/auth/login`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ email, password: PASSWORD }),

  });

  const body = await json(res);

  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`);

  if (body?.mfaRequired) throw new Error(`login ${email}: MFA required (unexpected for seed defaults)`);

  if (!body?.accessToken) throw new Error(`login ${email}: no accessToken`);

  return body.accessToken as string;

}



async function get(path: string, token: string) {

  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });

  const body = await json(res);

  return { ok: res.ok, status: res.status, body };

}



async function expectOk(label: string, result: { ok: boolean; status: number }) {

  if (!result.ok) throw new Error(`${label} failed: ${result.status}`);

}



async function expectForbidden(label: string, result: { ok: boolean; status: number }) {

  if (result.ok || result.status !== 403) throw new Error(`${label} should be forbidden (got ${result.status})`);

}



async function main() {

  console.log(`Smoke testing ${API}`);



  const tokens: Record<string, string> = {};

  for (const account of accounts) {

    const token = await login(account.email);

    tokens[account.role] = token;

    const me = await get('/auth/me', token);

    await expectOk(`${account.role} /auth/me`, me);

    if (me.body?.role !== account.role) throw new Error(`${account.role} role mismatch: ${me.body?.role}`);



    const dash = await get('/dashboard/me', token);

    await expectOk(`${account.role} dashboard`, dash);



    const actionCenter = await get('/dashboard/action-center', token);

    await expectOk(`${account.role} action-center`, actionCenter);



    console.log(`  OK ${account.role} (${account.email})`);

  }



  const admin = tokens.ACADEMIC_ADMIN;

  for (const path of ['/students?pageSize=5', '/batches?pageSize=5', '/exams?pageSize=5', '/behaviour', '/interns', '/action-centre', '/feed', '/parents?pageSize=5']) {

    await expectOk(`admin GET ${path}`, await get(path, admin));

  }

  console.log('  OK Academic Admin list endpoints');



  await expectOk('student exams', await get('/exams?pageSize=5', tokens.STUDENT));

  await expectOk('student tasks', await get('/tasks?pageSize=5', tokens.STUDENT));

  await expectOk('student feed', await get('/feed', tokens.STUDENT));

  await expectOk('student fee accounts', await get('/fees/accounts', tokens.STUDENT));

  console.log('  OK Student scoped endpoints');



  await expectOk('parent feed', await get('/feed', tokens.PARENT));

  await expectOk('parent fee accounts', await get('/fees/accounts', tokens.PARENT));

  console.log('  OK Parent scoped endpoints');



  await expectOk('admin fees dashboard', await get('/fees/dashboard', admin));
  console.log('  OK Academic Admin fees access');

  await expectOk('accounts fees dashboard', await get('/fees/dashboard', tokens.ACCOUNTS));

  await expectOk('accounts batches', await get('/batches?pageSize=5', tokens.ACCOUNTS));

  await expectForbidden('accounts interns', await get('/interns', tokens.ACCOUNTS));

  console.log('  OK Accounts fees + RBAC');



  await expectForbidden('faculty fees dashboard', await get('/fees/dashboard', tokens.FACULTY));

  await expectOk('faculty postable batches', await get('/feed/postable-batches', tokens.FACULTY));

  console.log('  OK Faculty feed batches + fees blocked');



  await expectOk('management students report', await get('/reports/students.xlsx', tokens.MANAGEMENT));

  console.log('  OK Management reports');



  console.log('Smoke passed.');

}



main().catch((err) => {

  console.error('Smoke FAILED:', err.message || err);

  process.exit(1);

});

