import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, StatCard, Table, Badge, Modal } from '@/components/ui';

const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ACCOUNTS'];

export default function FeesPage() {
  const { user } = useAuth();
  const canManage = user && FULL_ACCESS_ROLES.includes(user.role);
  const isSelfView = user?.role === 'STUDENT' || user?.role === 'PARENT';

  if (isSelfView) return <SelfFeesView />;

  return <StaffFeesView canManage={!!canManage} />;
}

function StaffFeesView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [form, setForm] = useState({ studentId: '', totalPayable: '', planType: 'ONE_TIME' });
  const [payForm, setPayForm] = useState({ amount: '', mode: 'CASH', reference: '' });

  const { data: dashboard } = useQuery({ queryKey: ['fees', 'dashboard'], queryFn: async () => (await api.get('/fees/dashboard')).data });
  const { data: accounts, isLoading } = useQuery({ queryKey: ['fees', 'accounts'], queryFn: async () => (await api.get('/fees/accounts')).data });
  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', studentSearch],
    queryFn: async () => (await api.get('/students', { params: { search: studentSearch, pageSize: 10 } })).data,
    enabled: createOpen && studentSearch.length > 1,
  });

  async function createAccount() {
    if (!form.studentId || !form.totalPayable) return toast.error('Select a student and enter the total payable');
    try {
      await api.post('/fees/accounts', { studentId: form.studentId, totalPayable: Number(form.totalPayable), planType: form.planType });
      toast.success('Fee account created');
      setCreateOpen(false);
      setForm({ studentId: '', totalPayable: '', planType: 'ONE_TIME' });
      queryClient.invalidateQueries({ queryKey: ['fees'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function recordPayment() {
    if (!payTarget || !payForm.amount) return toast.error('Enter an amount');
    try {
      const res = await api.post(`/fees/accounts/${payTarget.id}/payments`, { amount: Number(payForm.amount), mode: payForm.mode, reference: payForm.reference || undefined });
      toast.success(`Payment recorded. Receipt ${res.data.receipt.receiptNumber}`);
      setPayTarget(null);
      setPayForm({ amount: '', mode: 'CASH', reference: '' });
      queryClient.invalidateQueries({ queryKey: ['fees'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Fees"
        subtitle="Fee accounts, payments, receipts and reconciliation."
        actions={canManage && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Create Fee Account</button>}
      />

      {dashboard && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Collected This Month" value={`Rs. ${dashboard.collectedThisMonth.toLocaleString('en-IN')}`} />
          <StatCard label="Total Outstanding" value={`Rs. ${dashboard.totalOutstanding.toLocaleString('en-IN')}`} tone={dashboard.totalOutstanding > 0 ? 'warn' : 'good'} />
          <StatCard label="Fee Accounts" value={dashboard.accountCount} />
          <StatCard label="Cash Pending Reconciliation" value={dashboard.cashPendingReconciliation} tone={dashboard.cashPendingReconciliation > 0 ? 'warn' : 'good'} />
        </div>
      )}

      <Table
        loading={isLoading}
        rows={accounts ?? []}
        keyFn={(r: any) => r.id}
        columns={[
          { header: 'Student', cell: (r: any) => `${r.student.firstName} ${r.student.lastName}` },
          { header: 'Batch', cell: (r: any) => r.student.currentBatch?.name ?? '-' },
          { header: 'Total Payable', cell: (r: any) => `Rs. ${r.totalPayable.toLocaleString('en-IN')}` },
          { header: 'Outstanding', cell: (r: any) => <Badge tone={r.outstanding > 0 ? 'amber' : 'green'}>Rs. {r.outstanding.toLocaleString('en-IN')}</Badge> },
          { header: 'Next Due', cell: (r: any) => (r.nextDue ? new Date(r.nextDue.dueDate).toDateString() : 'Fully paid') },
          ...(canManage
            ? [{ header: 'Actions', cell: (r: any) => <button className="text-xs text-brand-ink hover:underline" onClick={() => setPayTarget(r)}>Record Payment</button> }]
            : []),
        ]}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Fee Account">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Student</span>
            <input className="input" placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            {studentResults?.items?.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-edge">
                {studentResults.items.map((s: any) => (
                  <button key={s.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted" onClick={() => { setForm((f) => ({ ...f, studentId: s.id })); setStudentSearch(`${s.firstName} ${s.lastName}`); }}>
                    {s.firstName} {s.lastName}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block"><span className="label">Total Payable (Rs.)</span><input className="input" type="number" value={form.totalPayable} onChange={(e) => setForm((f) => ({ ...f, totalPayable: e.target.value }))} /></label>
          <label className="block">
            <span className="label">Plan</span>
            <select className="input" value={form.planType} onChange={(e) => setForm((f) => ({ ...f, planType: e.target.value }))}>
              <option value="ONE_TIME">One-time</option>
              <option value="INSTALMENT">Instalment</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </label>
          <div className="flex justify-end"><button className="btn-primary" onClick={createAccount}>Create</button></div>
        </div>
      </Modal>

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Record Payment">
        <div className="space-y-3">
          <label className="block"><span className="label">Amount (Rs.)</span><input className="input" type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} /></label>
          <label className="block">
            <span className="label">Mode</span>
            <select className="input" value={payForm.mode} onChange={(e) => setPayForm((f) => ({ ...f, mode: e.target.value }))}>
              {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'GATEWAY'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Reference (optional)</span><input className="input" value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} /></label>
          <div className="flex justify-end gap-2">
            <button className="btn-primary" onClick={recordPayment}>Record</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const INSTALMENT_STATUS_TONE: Record<string, 'green' | 'amber' | 'red'> = { PAID: 'green', PENDING: 'amber', OVERDUE: 'red' };

function SelfFeesView() {
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';
  const { data: accounts, isLoading } = useQuery({ queryKey: ['fees', 'accounts', 'self'], queryFn: async () => (await api.get('/fees/accounts')).data });

  async function downloadReceipt(receiptId: string, receiptNumber: string) {
    const res = await api.get(`/fees/receipts/${receiptId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${receiptNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader title="Fees" subtitle={user?.role === 'PARENT' ? "Your child's fee account and receipts." : 'Your fee account and receipts.'} />
      {isLoading ? null : (accounts ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">No fee account on record yet.</p>
      ) : (
        (accounts ?? []).map((a: any) => (
          <div key={a.id} className="card mb-4 p-4">
            <div className="mb-3 grid grid-cols-3 gap-3">
              <StatCard label="Total Payable" value={`Rs. ${a.totalPayable.toLocaleString('en-IN')}`} />
              <StatCard label="Outstanding" value={`Rs. ${a.outstanding.toLocaleString('en-IN')}`} tone={a.outstanding > 0 ? 'warn' : 'good'} />
              <StatCard label="Next Due" value={a.nextDue ? new Date(a.nextDue.dueDate).toLocaleDateString() : 'Paid up'} />
            </div>
            {isParent && (
              <>
                <h3 className="mb-1 text-sm font-semibold text-ink">Instalment Schedule</h3>
                <Table
                  rows={[...(a.instalments ?? [])].sort((x: any, y: any) => x.sequence - y.sequence)}
                  keyFn={(i: any) => i.id}
                  emptyText="No instalments scheduled"
                  columns={[
                    { header: 'Instalment', cell: (i: any) => `#${i.sequence}` },
                    { header: 'Amount', cell: (i: any) => `Rs. ${i.amount.toLocaleString('en-IN')}` },
                    { header: 'Due Date', cell: (i: any) => new Date(i.dueDate).toDateString() },
                    { header: 'Status', cell: (i: any) => <Badge tone={INSTALMENT_STATUS_TONE[i.status] ?? 'amber'}>{i.status}</Badge> },
                  ]}
                />
              </>
            )}
            <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Payment History</h3>
            <Table
              rows={a.payments ?? []}
              keyFn={(p: any) => p.id}
              columns={[
                { header: 'Date', cell: (p: any) => new Date(p.paidAt).toDateString() },
                { header: 'Amount', cell: (p: any) => `Rs. ${p.amount.toLocaleString('en-IN')}` },
                { header: 'Mode', cell: (p: any) => p.mode },
                { header: 'Receipt', cell: (p: any) => p.receipt ? <button className="text-xs text-brand-ink hover:underline" onClick={() => downloadReceipt(p.receipt.id, p.receipt.receiptNumber)}>{p.receipt.receiptNumber}</button> : '-' },
              ]}
            />
          </div>
        ))
      )}
    </div>
  );
}
