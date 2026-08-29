import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { pageSize: 8 } });
      return data as { items: NotificationItem[]; unreadCount: number };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

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
        aria-label={`Notifications${data?.unreadCount ? `, ${data.unreadCount} unread` : ''}`}
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
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="card absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] shadow-xl" role="menu">
            <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              <div className="flex items-center gap-2">
                {(isLoading || isFetching) && <span className="text-xs text-ink-muted">Updating…</span>}
                {!!data?.unreadCount && (
                  <button type="button" onClick={markAllRead} className="text-xs text-brand-ink hover:underline">Mark all read</button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <p className="px-4 py-6 text-center text-sm text-ink-muted">Loading…</p>
              ) : data?.items.length ? (
                data.items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`block w-full border-b border-edge px-4 py-2.5 text-left text-sm hover:bg-surface-muted ${n.isRead ? '' : 'bg-brand-600/10'}`}
                  >
                    <p className="font-medium text-ink">{n.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[10px] text-ink-muted">{new Date(n.createdAt).toLocaleString()}</p>
                  </button>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-ink-muted">No notifications yet</p>
              )}
            </div>
            <div className="border-t border-edge px-4 py-2 text-center">
              <Link to="/notifications" className="text-xs text-brand-ink hover:underline" onClick={() => setOpen(false)}>
                View all notifications →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
