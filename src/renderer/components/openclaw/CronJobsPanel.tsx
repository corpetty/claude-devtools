import { useEffect, useState } from 'react';

interface CronJob {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  schedule?: { kind?: string; expr?: string; tz?: string };
  payload?: { kind?: string; message?: string; timeoutSeconds?: number };
  delivery?: { mode?: string; channel?: string; to?: string };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
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

export const CronJobsPanel = (): React.JSX.Element => {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

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
              className={`border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30 ${
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
  );
};
