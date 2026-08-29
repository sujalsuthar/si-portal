import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, EmptyState, Spinner } from '@/components/ui';

function PreferencesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notifications', 'preferences'], queryFn: async () => (await api.get('/notifications/preferences')).data });

  async function setPreference(category: string, patch: { inApp?: boolean; email?: boolean }) {
    const current = data.find((p: any) => p.category === category);
    await api.put(`/notifications/preferences/${category}`, { inApp: current.inApp, email: current.email, ...patch });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
  }

  if (isLoading || !data) return null;

  return (
    <details className="card mb-4 overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
        Notification preferences
      </summary>
      <div className="divide-y divide-edge border-t border-edge">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 text-xs font-medium text-ink-muted">
          <span>Category</span>
          <span className="w-16 text-center">In-app</span>
          <span className="w-16 text-center">Email</span>
        </div>
        {data.map((p: any) => (
          <div key={p.category} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2 text-sm">
            <span className="text-ink">{p.category.replace(/_/g, ' ')}</span>
            <span className="w-16 text-center">
              <input type="checkbox" checked={p.inApp} onChange={(e) => setPreference(p.category, { inApp: e.target.checked })} aria-label={`${p.category} in-app notifications`} />
            </span>
            <span className="w-16 text-center">
              <input type="checkbox" checked={p.email} onChange={(e) => setPreference(p.category, { email: e.target.checked })} aria-label={`${p.category} email notifications`} />
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showPreferences, setShowPreferences] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['notifications', 'page'], queryFn: async () => (await api.get('/notifications', { params: { pageSize: 50 } })).data });

  async function openNotification(n: { id: string; isRead: boolean; link?: string | null }) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (n.link) navigate(n.link);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Exam reminders, task deadlines, alerts and updates."
        actions={<button className="btn-secondary" onClick={() => setShowPreferences((s) => !s)}>{showPreferences ? 'Hide' : 'Manage'} preferences</button>}
      />
      {showPreferences && <PreferencesPanel />}
      {isLoading ? (
        <Spinner />
      ) : !data?.items?.length ? (
        <EmptyState text="No notifications yet" />
      ) : (
        <div className="card divide-y divide-edge">
          {data.items.map((n: any) => (
            <button key={n.id} onClick={() => openNotification(n)} className={`block w-full px-4 py-3 text-left text-sm hover:bg-surface-muted ${n.isRead ? '' : 'bg-brand-600/10'}`}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{n.title}</p>
                <span className="text-xs text-ink-muted">{new Date(n.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-0.5 text-ink-muted">{n.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
