import { useEffect, useRef, useState } from 'react';

interface CronJob {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  schedule?: { kind?: string; expr?: string; tz?: string; staggerMs?: number };
  payload?: { kind?: string; message?: string; systemEvent?: string; timeoutSeconds?: number };
  delivery?: { mode?: string; channel?: string; to?: string };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
    lastDelivered?: boolean;
    lastDeliveryStatus?: string;
  };
}

function relativeTime(ms: number | undefined): string {
  if (!ms) return '-';
  const diff = Date.now() - ms;
  const absDiff = Math.abs(diff);
  const future = diff < 0;
  const mins = Math.floor(absDiff / 60000);
  if (mins < 1) return future ? 'in <1m' : 'just now';
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

function absoluteTime(ms: number | undefined): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

function statusIcon(status: string | undefined): string {
  if (status === 'ok') return '\u2705';
  if (status === 'error') return '\u274C';
  return '\u23F3';
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  return `${Math.round(ms / 1000)}s`;
}

function prettifyAgent(id: string | undefined): string {
  if (!id) return '-';
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </div>
      <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-32 shrink-0 text-zinc-500">{label}</span>
      <span className="text-zinc-200">{value ?? '-'}</span>
    </div>
  );
}

function CronJobModal({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const copyId = () => {
    navigator.clipboard.writeText(job.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const payloadText = job.payload?.message ?? job.payload?.systemEvent;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleOverlayClick}
    >
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{job.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  job.enabled
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {job.enabled ? 'ENABLED' : 'DISABLED'}
              </span>
              <span className="text-[10px] text-zinc-600">{prettifyAgent(job.agentId)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {/* Schedule */}
        <Section title="Schedule">
          <Row label="Expression" value={<span className="font-mono text-xs">{job.schedule?.expr ?? job.schedule?.kind ?? '-'}</span>} />
          <Row label="Timezone" value={job.schedule?.tz ?? 'UTC'} />
          {job.schedule?.staggerMs && (
            <Row label="Stagger" value={`${Math.round(job.schedule.staggerMs / 1000)}s`} />
          )}
        </Section>

        {/* Payload */}
        <Section title="Payload">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-indigo-900/50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
              {job.payload?.kind ?? 'unknown'}
            </span>
            {job.payload?.timeoutSeconds && (
              <span className="text-xs text-zinc-500">timeout: {job.payload.timeoutSeconds}s</span>
            )}
          </div>
          {payloadText ? (
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 font-mono text-xs leading-relaxed text-zinc-300">
              {payloadText}
            </pre>
          ) : (
            <span className="text-xs text-zinc-600">No message content</span>
          )}
        </Section>

        {/* Delivery */}
        {job.delivery && (
          <Section title="Delivery">
            <Row label="Mode" value={job.delivery.mode} />
            <Row label="Channel" value={job.delivery.channel} />
            {job.delivery.to && <Row label="To" value={job.delivery.to} />}
          </Section>
        )}

        {/* State */}
        <Section title="State">
          <Row label="Last run" value={`${relativeTime(job.state?.lastRunAtMs)} — ${absoluteTime(job.state?.lastRunAtMs)}`} />
          <Row label="Next run" value={`${relativeTime(job.state?.nextRunAtMs)} — ${absoluteTime(job.state?.nextRunAtMs)}`} />
          <Row label="Duration" value={formatDuration(job.state?.lastDurationMs)} />
          <Row
            label="Status"
            value={
              <span>
                {statusIcon(job.state?.lastStatus)} {job.state?.lastStatus ?? 'pending'}
                {(job.state?.consecutiveErrors ?? 0) > 0 && (
                  <span className="ml-2 text-red-400">({job.state?.consecutiveErrors} consecutive errors)</span>
                )}
              </span>
            }
          />
          {job.state?.lastDeliveryStatus && (
            <Row
              label="Delivery"
              value={
                <span>
                  {job.state.lastDelivered ? '✅' : '❌'} {job.state.lastDeliveryStatus}
                </span>
              }
            />
          )}
        </Section>

        {/* ID */}
        <div className="mt-2">
          <span className="text-[10px] text-zinc-600">Job ID — </span>
          <button
            onClick={copyId}
            title="Click to copy"
            className="font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {job.id} {copied ? '✓' : '⎘'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const CronJobsPanel = (): React.JSX.Element => {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/openclaw/crons')
      .then((r) => r.json() as Promise<CronJob[]>)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-xs text-zinc-500">Loading cron jobs...</div>;
  }

  if (jobs.length === 0) {
    return <div className="p-4 text-xs text-zinc-500">No cron jobs configured</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Agent</th>
              <th className="px-4 py-2 font-semibold">Schedule</th>
              <th className="px-4 py-2 font-semibold">Last Run</th>
              <th className="px-4 py-2 font-semibold">Duration</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Next Run</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className={`cursor-pointer border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/40 ${
                  !job.enabled ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-2 text-zinc-300">
                  {job.name}
                  {!job.enabled && (
                    <span className="ml-1.5 text-[10px] text-zinc-600">(disabled)</span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-400">{prettifyAgent(job.agentId)}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500">
                  {job.schedule?.expr ?? job.schedule?.kind ?? '-'}
                </td>
                <td className="px-4 py-2 text-zinc-400">{relativeTime(job.state?.lastRunAtMs)}</td>
                <td className="px-4 py-2 text-zinc-400">
                  {formatDuration(job.state?.lastDurationMs)}
                </td>
                <td className="px-4 py-2">
                  <span title={job.state?.lastStatus ?? 'pending'}>
                    {statusIcon(job.state?.lastStatus)}
                  </span>
                  {(job.state?.consecutiveErrors ?? 0) > 0 && (
                    <span className="ml-1 text-[10px] text-red-400">
                      {job.state?.consecutiveErrors}x
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-400">{relativeTime(job.state?.nextRunAtMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedJob && (
        <CronJobModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
};
