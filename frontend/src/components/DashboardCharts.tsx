import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useChartColors } from '@/lib/chartColors';
import { Modal, Spinner, EmptyState } from '@/components/ui';

interface WidgetMeta {
  key: string;
  label: string;
  chartType: 'line' | 'bar' | 'pie';
}

interface WidgetData {
  data: Record<string, string | number>[];
  series?: string[];
}

/** One chart card - picks the right recharts component for the widget's declared chart type. */
function WidgetCard({ meta, widgetData }: { meta: WidgetMeta; widgetData?: WidgetData }) {
  const colors = useChartColors();
  const data = widgetData?.data ?? [];
  const series = widgetData?.series;

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{meta.label}</h3>
      {data.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-center text-xs text-ink-muted">Not enough data yet</p>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            {meta.chartType === 'pie' ? (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                  {data.map((_, i) => (
                    <Cell key={i} fill={colors.categorical[i % colors.categorical.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--color-surface))', border: `1px solid ${colors.grid}`, color: colors.text, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: colors.muted }} />
              </PieChart>
            ) : meta.chartType === 'bar' ? (
              <BarChart data={data}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 50 : 30} />
                <YAxis tick={{ fill: colors.muted, fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--color-surface))', border: `1px solid ${colors.grid}`, color: colors.text, fontSize: 12 }} />
                <Bar dataKey="value" fill={colors.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: colors.muted, fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--color-surface))', border: `1px solid ${colors.grid}`, color: colors.text, fontSize: 12 }} />
                {series && series.length > 0 ? (
                  <>
                    <Legend wrapperStyle={{ fontSize: 12, color: colors.muted }} />
                    {series.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={colors.categorical[i % colors.categorical.length]} strokeWidth={2} dot={false} />
                    ))}
                  </>
                ) : (
                  <Line type="monotone" dataKey="value" stroke={colors.primary} strokeWidth={2} dot={false} />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Role-based, per-user-customizable chart dashboard - a "Customize" panel lets each user pick which
 * of their role's available widgets to show, saved server-side so it persists across sessions/devices. */
export default function DashboardCharts() {
  const queryClient = useQueryClient();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[] | null>(null);

  const { data: catalog } = useQuery<WidgetMeta[]>({ queryKey: ['dashboard', 'widgets', 'catalog'], queryFn: async () => (await api.get('/dashboard/widgets/catalog')).data });
  const { data: preferences } = useQuery<{ widgetKeys: string[] }>({ queryKey: ['dashboard', 'preferences'], queryFn: async () => (await api.get('/dashboard/preferences')).data });

  const selectedKeys = preferences?.widgetKeys ?? [];
  const { data: widgetData, isLoading } = useQuery<Record<string, WidgetData>>({
    queryKey: ['dashboard', 'widgets', 'data', selectedKeys.join(',')],
    queryFn: async () => (await api.get('/dashboard/widgets/data', { params: { keys: selectedKeys.join(',') } })).data,
    enabled: selectedKeys.length > 0,
  });

  function openCustomize() {
    setDraftKeys(selectedKeys);
    setCustomizeOpen(true);
  }

  function toggleDraftKey(key: string) {
    setDraftKeys((prev) => {
      const cur = prev ?? [];
      return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    });
  }

  async function savePreferences() {
    try {
      await api.put('/dashboard/preferences', { widgetKeys: draftKeys ?? [] });
      toast.success('Dashboard updated');
      setCustomizeOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'preferences'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  if (!catalog || catalog.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Charts</h2>
        <button className="btn-secondary text-xs" onClick={openCustomize}>Customize</button>
      </div>

      {selectedKeys.length === 0 ? (
        <EmptyState text="No charts selected yet - click Customize to add some." />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog
            .filter((w) => selectedKeys.includes(w.key))
            .map((w) => (
              <WidgetCard key={w.key} meta={w} widgetData={widgetData?.[w.key]} />
            ))}
        </div>
      )}

      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Customize dashboard" wide>
        <p className="mb-3 text-sm text-ink-muted">Choose which charts appear on your dashboard.</p>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {catalog.map((w) => (
            <label key={w.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted">
              <input type="checkbox" checked={(draftKeys ?? []).includes(w.key)} onChange={() => toggleDraftKey(w.key)} />
              <span className="text-ink">{w.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setCustomizeOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={savePreferences}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
