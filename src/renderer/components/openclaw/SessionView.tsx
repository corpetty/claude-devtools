import { useEffect, useState } from 'react';

interface Message {
  role: string;
  timestamp: string;
  contentPreview: string;
}

interface ModelChange {
  timestamp: string;
  provider: string;
  modelId: string;
}

interface SessionData {
  sessionId: string;
  createdAt: string | null;
  model: string;
  messages: Message[];
  modelChanges: ModelChange[];
}

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

interface SessionViewProps {
  agentId: string;
  sessionId: string;
}

export const SessionView = ({ agentId, sessionId }: SessionViewProps): React.JSX.Element => {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/openclaw/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/messages`
    )
      .then((r) => r.json() as Promise<SessionData>)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [agentId, sessionId]);

  if (loading) {
    return <div className="p-4 text-xs text-zinc-500">Loading messages...</div>;
  }

  if (!data) {
    return <div className="p-4 text-xs text-zinc-500">Failed to load session</div>;
  }

  // Merge messages and model changes into a single timeline by timestamp
  type TimelineItem =
    | { kind: 'message'; data: Message }
    | { kind: 'model_change'; data: ModelChange };

  const timeline: TimelineItem[] = [];
  for (const m of data.messages) {
    timeline.push({ kind: 'message', data: m });
  }
  for (const mc of data.modelChanges) {
    timeline.push({ kind: 'model_change', data: mc });
  }
  timeline.sort((a, b) => {
    const ta = a.data.timestamp;
    const tb = b.data.timestamp;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="border-b border-zinc-800 px-4 py-2">
        <div className="text-xs text-zinc-500">
          Session {sessionId.slice(0, 12)}...
          {data.model && <span className="ml-2 text-zinc-400">{data.model}</span>}
          {data.createdAt && (
            <span className="ml-2">{new Date(data.createdAt).toLocaleString()}</span>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-1 p-4">
        {timeline.length === 0 && (
          <div className="text-xs text-zinc-500">No messages in this session</div>
        )}
        {timeline.map((item, i) => {
          if (item.kind === 'model_change') {
            return (
              <div
                key={`mc-${i}`}
                className="flex items-center gap-2 py-2 text-[11px] text-zinc-500"
              >
                <div className="h-px flex-1 bg-zinc-800" />
                <span>switched to {item.data.modelId}</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
            );
          }

          const msg = item.data;
          const isUser = msg.role === 'user';
          return (
            <div
              key={`msg-${i}`}
              className={`rounded-lg px-3 py-2 ${isUser ? 'bg-zinc-800' : 'bg-transparent'}`}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span
                  className={isUser ? 'font-medium text-zinc-300' : 'font-medium text-blue-400'}
                >
                  {isUser ? 'User' : 'Assistant'}
                </span>
                <span className="text-zinc-600">{formatTimestamp(msg.timestamp)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {msg.contentPreview}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
