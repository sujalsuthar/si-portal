import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';

type Props = {
  studentId: string;
  selectedLabel?: string;
  onSelect: (studentId: string, label: string) => void;
  onClear: () => void;
  enabled?: boolean;
  placeholder?: string;
  studentType?: 'STUDENT' | 'INTERN';
  batchId?: string;
  excludeIds?: string[];
};

export function StudentSearchPicker({
  studentId,
  selectedLabel = '',
  onSelect,
  onClear,
  enabled = true,
  placeholder = 'Search student…',
  studentType,
  batchId,
  excludeIds = [],
}: Props) {
  const [search, setSearch] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (enabled && batchId && !studentId) setOpen(true);
  }, [enabled, batchId, studentId]);

  const { data: studentResults } = useQuery({
    queryKey: ['students', 'search', search, studentType, batchId],
    queryFn: async () =>
      (await api.get('/students', {
        params: {
          ...(search.trim() ? { search: search.trim() } : {}),
          pageSize: 25,
          ...(studentType ? { studentType } : {}),
          ...(batchId ? { batchId } : {}),
        },
      })).data,
    enabled: enabled && open && !studentId && (search.length > 0 || !!batchId),
  });

  const visibleStudents = (studentResults?.items ?? []).filter(
    (s: { id: string }) => !excludeIds.includes(s.id),
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    setOpen(true);
    if (studentId) onClear();
  }

  function pick(student: { id: string; firstName: string; lastName: string }) {
    const label = `${student.firstName} ${student.lastName}`;
    onSelect(student.id, label);
    setSearch(label);
    setOpen(false);
  }

  return (
    <label className="block">
      <span className="label">Student</span>
      {studentId ? (
        <div className="flex items-center gap-2">
          <Badge tone="green">{selectedLabel || search || 'Selected'}</Badge>
          <button type="button" className="text-xs text-brand-ink hover:underline" onClick={() => { onClear(); setSearch(''); setOpen(false); }}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            className="input"
            placeholder={placeholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setOpen(true)}
          />
          {open && visibleStudents.length > 0 && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-edge">
              {visibleStudents.map((s: { id: string; firstName: string; lastName: string }) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                  onClick={() => pick(s)}
                >
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          )}
          {open && (search.length > 0 || batchId) && visibleStudents.length === 0 && (
            <p className="mt-1 text-xs text-ink-muted">No students found — check the name or batch.</p>
          )}
        </>
      )}
    </label>
  );
}
