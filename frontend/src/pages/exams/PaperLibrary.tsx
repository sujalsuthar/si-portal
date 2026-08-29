import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';

export default function PaperLibrary() {
  const { data: libraryPapers, isLoading } = useQuery({
    queryKey: ['paper-library'],
    queryFn: async () => (await api.get('/exams/papers/library')).data,
  });

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle="Saved exam papers from the Question Bank — attach them when scheduling an exam."
        actions={
          <Link to="/exams/questions" className="btn-primary">
            + Build in Question Bank
          </Link>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (libraryPapers ?? []).length === 0 ? (
        <EmptyState text="No saved papers yet. Create papers in the Question Bank and save them to the library." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(libraryPapers ?? []).map((p: any) => (
            <div key={p.id} className="card p-4">
              <h3 className="font-semibold text-ink">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {p._count?.examQuestions ?? 0} questions · {p.totalMarks} marks
              </p>
              {p.createdAt && (
                <p className="mt-2 text-xs text-ink-muted">
                  Saved {new Date(p.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
