import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicApi, apiErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui';

interface VerifyResult {
  certificateNumber: string;
  studentName: string;
  title: string;
  batchName: string | null;
  completionDate: string;
  issueDate: string;
  status: 'VALID' | 'REVOKED' | 'EXPIRED';
  revokedReason?: string;
}

export default function VerifyCertificate() {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(certificateNumber ?? '');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['verify', certificateNumber],
    queryFn: async () => {
      const { data } = await publicApi.get<VerifyResult>(`/verify/${encodeURIComponent(certificateNumber!)}`);
      return data;
    },
    enabled: !!certificateNumber,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-surface-muted px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-ink">Certificate Verification</h1>
          <p className="mt-1 text-sm text-ink-muted">Verify the authenticity of an SI Portal certificate - no login required.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchValue.trim()) navigate(`/verify/${encodeURIComponent(searchValue.trim())}`);
          }}
          className="card mb-6 flex gap-2 p-3"
        >
          <input
            className="input"
            placeholder="Enter certificate number (e.g. SI-2026-AB12CD34)"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          <button className="btn-primary shrink-0" type="submit">Verify</button>
        </form>

        {!certificateNumber && <p className="text-center text-sm text-ink-muted">Enter a certificate number above, or scan the QR code on a certificate.</p>}

        {certificateNumber && isLoading && <p className="text-center text-sm text-ink-muted">Checking…</p>}

        {certificateNumber && isError && (
          <div className="card border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
            {apiErrorMessage(error, 'Certificate not found')}
          </div>
        )}

        {data && (
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-ink-muted">Certificate No.</span>
              <span className="font-mono text-sm font-medium">{data.certificateNumber}</span>
            </div>
            <div className="mb-4 flex justify-center">
              {data.status === 'VALID' && <Badge tone="green">VALID</Badge>}
              {data.status === 'REVOKED' && <Badge tone="red">REVOKED</Badge>}
              {data.status === 'EXPIRED' && <Badge tone="amber">EXPIRED</Badge>}
            </div>
            <dl className="space-y-2.5 text-sm">
              <Row label="Student" value={data.studentName} />
              <Row label="Certificate" value={data.title} />
              {data.batchName && <Row label="Batch" value={data.batchName} />}
              <Row label="Completion Date" value={new Date(data.completionDate).toDateString()} />
              <Row label="Issue Date" value={new Date(data.issueDate).toDateString()} />
              {data.revokedReason && <Row label="Revocation Reason" value={data.revokedReason} />}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-edge pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink text-right">{value}</dd>
    </div>
  );
}
