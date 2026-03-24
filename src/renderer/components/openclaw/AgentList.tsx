import { useEffect, useState } from 'react';

interface Agent {
  id: string;
  sessionCount: number;
  latestModel: string;
  latestUpdatedAt: number;
}

function prettifyName(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  // "claude-3-5-sonnet-20241022" -> "sonnet"
  if (model.startsWith('claude-')) {
    const parts = model.replace('claude-', '').split('-');
    // Find the name part (not a number or date)
    const name = parts.find((p) => !/^\d/.test(p));
    return name ?? model;
  }
  // "Qwen/Qwen3-14B-AWQ" -> "qwen3-14b"
  const base = model.split('/').pop() ?? model;
  return base.replace(/-AWQ$/i, '').toLowerCase();
}

interface AgentListProps {
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onShowCrons: () => void;
  onShowActivity: () => void;
  onShowGpu: () => void;
}

export const AgentList = ({
  selectedAgentId,
  onSelectAgent,
  onShowCrons,
  onShowActivity,
  onShowGpu,
}: AgentListProps): React.JSX.Element => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/openclaw/agents')
      .then((r) => r.json() as Promise<Agent[]>)
      .then(setAgents)
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Agents
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-3 py-4 text-xs text-zinc-500">Loading...</div>}
        {!loading && agents.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-500">No agents found</div>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`w-full border-0 px-3 py-2 text-left transition-colors ${
              selectedAgentId === agent.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'bg-transparent text-zinc-300 hover:bg-zinc-800/50'
            }`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium">{prettifyName(agent.id)}</span>
              <span className="ml-1 shrink-0 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {agent.sessionCount}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              {shortModel(agent.latestModel) && <span>{shortModel(agent.latestModel)}</span>}
              {agent.latestUpdatedAt > 0 && <span>{relativeTime(agent.latestUpdatedAt)}</span>}
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="border-t border-zinc-800 bg-transparent px-3 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
        onClick={onShowCrons}
      >
        Cron Jobs
      </button>
      <button
        type="button"
        className="border-t border-zinc-800 bg-transparent px-3 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
        onClick={onShowActivity}
      >
        Activity
      </button>
      <button
        type="button"
        className="border-t border-zinc-800 bg-transparent px-3 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
        onClick={onShowGpu}
      >
        GPU Monitor
      </button>
    </div>
  );
};
