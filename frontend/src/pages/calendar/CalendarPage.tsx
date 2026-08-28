import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PageHeader, Modal, Spinner } from '@/components/ui';

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start, end };
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<any>(null);
  const [form, setForm] = useState({ title: '', notes: '', startTime: '09:00', endTime: '' });

  const { start, end } = monthRange(cursor.year, cursor.month);
  const { data, isLoading } = useQuery({
    queryKey: ['calendar', cursor.year, cursor.month],
    queryFn: async () => (await api.get('/calendar/events', { params: { from: start.toISOString(), to: end.toISOString() } })).data,
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of data?.events ?? []) {
      const key = toDateKey(new Date(e.startAt));
      (map[key] ??= []).push({ ...e, kind: 'PERSONAL' });
    }
    for (const e of data?.readOnlyEvents ?? []) {
      const key = toDateKey(new Date(e.startAt));
      (map[key] ??= []).push(e);
    }
    return map;
  }, [data]);

  const weeks = useMemo(() => {
    const firstDay = new Date(cursor.year, cursor.month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.year, cursor.month, i + 1))];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  function openNewEvent(dateKey: string) {
    setSelectedDate(dateKey);
    setEditEvent(null);
    setForm({ title: '', notes: '', startTime: '09:00', endTime: '' });
  }

  function openEditEvent(dateKey: string, event: any) {
    setSelectedDate(dateKey);
    setEditEvent(event);
    const start = new Date(event.startAt);
    setForm({
      title: event.title,
      notes: event.notes ?? '',
      startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endTime: event.endAt ? new Date(event.endAt).toTimeString().slice(0, 5) : '',
    });
  }

  async function saveEvent() {
    if (!selectedDate || !form.title.trim()) return toast.error('Enter a title');
    const [h, m] = form.startTime.split(':').map(Number);
    const startAt = new Date(`${selectedDate}T00:00:00`);
    startAt.setHours(h, m, 0, 0);
    let endAt: Date | undefined;
    if (form.endTime) {
      const [eh, em] = form.endTime.split(':').map(Number);
      endAt = new Date(`${selectedDate}T00:00:00`);
      endAt.setHours(eh, em, 0, 0);
    }
    const payload = { title: form.title, notes: form.notes || undefined, startAt: startAt.toISOString(), endAt: endAt?.toISOString() };
    try {
      if (editEvent) await api.patch(`/calendar/events/${editEvent.id}`, payload);
      else await api.post('/calendar/events', payload);
      toast.success('Event saved');
      setSelectedDate(null);
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function deleteEvent() {
    if (!editEvent) return;
    try {
      await api.delete(`/calendar/events/${editEvent.id}`);
      toast.success('Event removed');
      setSelectedDate(null);
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your personal events, plus assigned sessions."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))}>←</button>
            <span className="text-sm font-medium text-ink">{monthLabel}</span>
            <button className="btn-secondary" onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))}>→</button>
          </div>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-edge border-b border-edge bg-surface-muted text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-2 py-1.5">{d}</div>
            ))}
          </div>
          <div className="divide-y divide-edge">
            {weeks.map((row, i) => (
              <div key={i} className="grid grid-cols-7 divide-x divide-edge">
                {row.map((date, j) => {
                  const key = date ? toDateKey(date) : `empty-${i}-${j}`;
                  const dayEvents = date ? eventsByDate[key] ?? [] : [];
                  const isToday = date && toDateKey(date) === toDateKey(today);
                  return (
                    <div key={key} className={`min-h-24 p-1.5 text-xs ${date ? 'cursor-pointer hover:bg-surface-muted' : 'bg-surface-muted/30'}`} onClick={() => date && openNewEvent(key)}>
                      {date && (
                        <>
                          <span className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-brand-600 text-ink' : 'text-ink-muted'}`}>{date.getDate()}</span>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 3).map((e: any) => (
                              <button
                                key={e.id}
                                className={`block w-full truncate rounded px-1 py-0.5 text-left ${e.kind === 'SESSION' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' : 'bg-brand-100 text-brand-ink dark:bg-brand-900'}`}
                                onClick={(ev) => { ev.stopPropagation(); if (e.kind === 'PERSONAL') openEditEvent(key, e); }}
                              >
                                {e.title}
                              </button>
                            ))}
                            {dayEvents.length > 3 && <span className="text-ink-muted">+{dayEvents.length - 3} more</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={editEvent ? 'Edit Event' : `New Event - ${selectedDate}`}>
        <div className="space-y-3">
          <label className="block"><span className="label">Title</span><input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Start Time</span><input className="input" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} /></label>
            <label className="block"><span className="label">End Time (optional)</span><input className="input" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} /></label>
          </div>
          <label className="block"><span className="label">Notes</span><textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          <div className="flex justify-between">
            {editEvent ? <button className="text-sm text-red-600 dark:text-red-400 hover:underline" onClick={deleteEvent}>Delete</button> : <span />}
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setSelectedDate(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEvent}>Save</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
