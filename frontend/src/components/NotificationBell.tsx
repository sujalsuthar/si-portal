import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { pageSize: 8 } });
      return data as { items: NotificationItem[]; unreadCount: number };
    },
    refetchInterval: 60_000,
  });

  async function markAllRead() {
    await api.post('/notifications/read-all');
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function openNotification(n: NotificationItem) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative min-h-[2.75rem] min-w-[2.75rem] rounded-full p-2 hover:bg-surface-muted"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon />
        {!!data?.unreadCount && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {data.unreadCount > 9 ? '9+' : data.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-20 mt-2 w-80 shadow-lg" role="menu">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            <button onClick={markAllRead} className="text-xs text-brand-ink hover:underline">Mark all read</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {data?.items.length ? (
              data.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`block w-full border-b border-edge px-4 py-2.5 text-left text-sm hover:bg-surface-muted ${n.isRead ? '' : 'bg-brand-600/10'}`}
                >
                  <p className="font-medium text-ink">{n.title}</p>
                  <p className="text-ink-muted text-xs mt-0.5">{n.message}</p>
                </button>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-sm text-ink-muted">No notifications yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
