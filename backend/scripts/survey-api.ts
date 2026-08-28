/**
 * API survey — hits nav-visible endpoints per role and reports failures.
 * Usage: API_URL=http://localhost:4000/api npx tsx scripts/survey-api.ts
 */
const API = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

const ROLES: Record<string, { email: string; paths: string[] }> = {
  SUPER_ADMIN: {
    email: 'admin@siportal.edu',
    paths: ['/dashboard/me', '/feed', '/sessions?pageSize=5', '/exams?pageSize=5', '/tasks?pageSize=5', '/interns', '/projects', '/fees/dashboard', '/certificates?pageSize=5', '/action-centre', '/reports/students.xlsx', '/backup', '/settings/scoring', '/students?pageSize=5'],
  },
  ACADEMIC_ADMIN: {
    email: 'academic.admin@siportal.edu',
    paths: ['/dashboard/me', '/feed', '/sessions?pageSize=5', '/exams?pageSize=5', '/tasks?pageSize=5', '/interns', '/fees/dashboard', '/certificates?pageSize=5', '/action-centre', '/backup', '/students?pageSize=5'],
  },
  FACULTY: {
    email: 'priya.faculty@siportal.edu',
    paths: ['/dashboard/me', '/feed', '/feed/postable-batches', '/sessions?pageSize=5', '/exams?pageSize=5', '/tasks?pageSize=5', '/interns', '/behaviour', '/calendar/events'],
  },
  STUDENT: {
    email: 'diya.patel@student.siportal.edu',
    paths: ['/dashboard/me', '/exams?pageSize=5', '/tasks?pageSize=5', '/fees/accounts', '/interns', '/feed'],
  },
  PARENT: {
    email: 'parent.aarav@siportal.edu',
    paths: ['/dashboard/me', '/fees/accounts', '/feed', '/action-centre', '/tasks?pageSize=5'],
  },
  MANAGEMENT: {
    email: 'management@siportal.edu',
    paths: ['/dashboard/me', '/reports/students.xlsx', '/students?pageSize=5'],
  },
  ACCOUNTS: {
    email: 'accounts@siportal.edu',
    paths: ['/dashboard/me', '/fees/dashboard', '/batches?pageSize=5'],
  },
};

async function login(email: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${text}`);
  return JSON.parse(text).accessToken as string;
}

async function get(path: string, token: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}

async function main() {
  const failures: string[] = [];
  for (const [role, { email, paths }] of Object.entries(ROLES)) {
    await new Promise((r) => setTimeout(r, 300));
    const token = await login(email);
    for (const path of paths) {
      const status = await get(path, token);
      const ok = status >= 200 && status < 400;
      console.log(`${ok ? 'OK' : 'FAIL'} [${role}] ${path} → ${status}`);
      if (!ok) failures.push(`[${role}] ${path} → ${status}`);
    }
  }
  // Blocked endpoints sanity
  const acct = await login('accounts@siportal.edu');
  const internStatus = await get('/interns', acct);
  console.log(`${internStatus === 403 ? 'OK' : 'FAIL'} [ACCOUNTS] /interns blocked → ${internStatus}`);
  if (internStatus !== 403) failures.push('[ACCOUNTS] /interns should be 403');

  if (failures.length) {
    console.log('\nFailures:', failures);
    process.exit(1);
  }
  console.log('\nSurvey API pass — all role endpoints reachable.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
