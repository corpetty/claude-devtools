import { useEffect, useState } from 'react';

interface SessionEntry {
  key: string;
  sessionId: string;
  updatedAt: number;
  model: string;
  chatType: string;
  displayName: string;
  subject: string;
  originLabel: string;
  abortedLastRun: boolean;
}

function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortModel(model: string): string {
  if (!model) return '';
  if (model.startsWith('claude-')) {
    const parts = model.replace('claude-', '').split('-');
    const name = parts.find((p) => !/^\d/.test(p));
    return name ?? model;
  }
  const base = model.split('/').pop() ?? model;
  return base.replace(/-AWQ$/i, '').toLowerCase();
}

interface SessionListProps {
  agentId: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export const SessionList = ({
  agentId,
  selectedSessionId,
  onSelectSession,
}: SessionListProps): React.JSX.Element => {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/openclaw/agents/${encodeURIComponent(agentId)}/sessions`)
      .then((r) => r.json() as Promise<SessionEntry[]>)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return <div className="p-4 text-xs text-zinc-500">Loading sessions...</div>;
  }

  if (sessions.length === 0) {
    return <div className="p-4 text-xs text-zinc-500">No sessions found</div>;
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Sessions ({sessions.length})
      </div>
      {sessions.map((s) => {
        const label = s.displayName || s.subject || s.originLabel || s.sessionId.slice(0, 12);
        return (
          <button
            key={s.sessionId}
            type="button"
            className={`w-full border-0 px-4 py-2.5 text-left transition-colors ${
              selectedSessionId === s.sessionId
                ? 'bg-zinc-800 text-zinc-100'
                : 'bg-transparent text-zinc-300 hover:bg-zinc-800/50'
            }`}
            onClick={() => onSelectSession(s.sessionId)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm" title={s.chatType === 'group' ? 'Group chat' : 'Direct'}>
                {s.chatType === 'group' ? '\uD83D\uDC65' : '\uD83D\uDCAC'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              {s.abortedLastRun && (
                <span className="shrink-0 text-[10px] text-red-400" title="Aborted last run">
                  aborted
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 pl-6 text-[11px] text-zinc-500">
              {shortModel(s.model) && <span>{shortModel(s.model)}</span>}
              <span>{relativeTime(s.updatedAt)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
