import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Badge, Modal, EmptyState, Spinner } from '@/components/ui';

const POSTER_ROLES = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'FACULTY'];

const FEED_MAX_BYTES = 2 * 1024 * 1024;
const FEED_ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.pdf';

function handleAttachmentPick(file: File | null, setAttachment: (f: File | null) => void) {
  if (!file) {
    setAttachment(null);
    return;
  }
  const okType = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type);
  if (!okType) {
    toast.error('Only JPG/JPEG and PDF files are allowed');
    return;
  }
  if (file.size > FEED_MAX_BYTES) {
    toast.error('File must be 2 MB or smaller');
    return;
  }
  setAttachment(file);
}

export default function FeedPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canPost = user && POSTER_ROLES.includes(user.role);
  const canPin = user && ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user.role);
  const isFaculty = user?.role === 'FACULTY';
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', batchId: '' });
  const [attachment, setAttachment] = useState<File | null>(null);

  const { data: posts, isLoading } = useQuery({ queryKey: ['feed'], queryFn: async () => (await api.get('/feed')).data });
  const { data: postableBatches } = useQuery({
    queryKey: ['feed', 'postable-batches'],
    queryFn: async () => (await api.get('/feed/postable-batches')).data,
    enabled: !!canPost && composeOpen,
  });

  useEffect(() => {
    if (!composeOpen || !isFaculty || !postableBatches?.length) return;
    setForm((f) => {
      if (f.batchId && postableBatches.some((b: { id: string }) => b.id === f.batchId)) return f;
      return { ...f, batchId: postableBatches[0].id };
    });
  }, [composeOpen, isFaculty, postableBatches]);

  function openCompose() {
    setForm({ title: '', content: '', batchId: '' });
    setAttachment(null);
    setComposeOpen(true);
  }

  function closeCompose() {
    setComposeOpen(false);
    setForm({ title: '', content: '', batchId: '' });
    setAttachment(null);
  }

  async function submitPost() {
    if (!form.title.trim() || !form.content.trim()) return toast.error('Fill in title and content');
    if (isFaculty && !form.batchId) return toast.error('Select a batch to post to');
    try {
      const payload = new FormData();
      payload.append('title', form.title);
      payload.append('content', form.content);
      if (form.batchId) payload.append('batchId', form.batchId);
      if (attachment) payload.append('attachment', attachment);
      await api.post('/feed', payload);
      toast.success('Posted to Feed');
      closeCompose();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function togglePin(id: string) {
    try {
      await api.patch(`/feed/${id}/pin`);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removePost(id: string) {
    if (!confirm('Delete this post?')) return;
    try {
      await api.delete(`/feed/${id}`);
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Feed"
        subtitle="Announcements from Super Admin, Admin and Team."
        actions={canPost && <button className="btn-primary" onClick={openCompose}>+ New Post</button>}
      />

      {isLoading ? (
        <Spinner />
      ) : !posts?.length ? (
        <EmptyState text="No announcements yet" />
      ) : (
        <div className="space-y-3">
          {posts.map((p: any) => {
            const canModerate = user && (p.author?.email === user.email || user.role === 'SUPER_ADMIN');
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.pinned && <Badge tone="amber">Pinned</Badge>}
                      <h2 className="font-semibold text-ink">{p.title}</h2>
                      {p.batch ? <Badge tone="blue">{p.batch.name}</Badge> : <Badge>Institute-wide</Badge>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{p.content}</p>
                    {p.attachmentUrl && (
                      /\.(jpe?g|png)$/i.test(p.attachmentUrl) ? (
                        <img src={p.attachmentUrl} alt="Attachment" className="mt-2 max-h-64 rounded-lg border border-edge" />
                      ) : (
                        <a href={p.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-ink hover:underline">View attachment</a>
                      )
                    )}
                    <p className="mt-2 text-xs text-ink-muted">
                      {p.author?.email} · {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canPin && (
                      <button className="text-xs text-brand-ink hover:underline" onClick={() => togglePin(p.id)}>
                        {p.pinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                    {canModerate && (
                      <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => removePost(p.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={composeOpen} onClose={closeCompose} title="New Announcement" wide>
        <div className="space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Content</span>
            <textarea className="input" rows={4} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Audience</span>
            {isFaculty && postableBatches && postableBatches.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">No assigned batches. Contact an admin.</p>
            ) : (
              <select className="input" value={form.batchId} onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))}>
                {isFaculty && <option value="" disabled>Select a batch...</option>}
                {!isFaculty && <option value="">Institute-wide (everyone)</option>}
                {postableBatches?.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="label">Attach file (optional)</span>
            <input className="input" type="file" accept={FEED_ACCEPT} onChange={(e) => handleAttachmentPick(e.target.files?.[0] ?? null, setAttachment)} />
            <span className="mt-1 block text-xs text-ink-muted">JPG/JPEG or PDF only, max 2 MB</span>
          </label>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={submitPost} disabled={isFaculty && postableBatches?.length === 0}>Post</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
