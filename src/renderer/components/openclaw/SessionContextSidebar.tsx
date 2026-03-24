import { useEffect, useState } from 'react';

import { X } from 'lucide-react';

interface SessionMeta {
  sessionKey: string;
  sessionId: string;
  channel: string;
  chatType: string;
  model: string;
  modelProvider: string;
  originLabel: string;
  displayName: string;
  deliveryTo: string;
  abortedLastRun: boolean;
  updatedAt: number;
  skills: string[];
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element | null {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="break-all text-xs text-zinc-300">{value}</span>
    </div>
  );
}

interface SessionContextSidebarProps {
  agentId: string;
  sessionId: string;
  onClose: () => void;
}

export const SessionContextSidebar = ({
  agentId,
  sessionId,
  onClose,
}: SessionContextSidebarProps): React.JSX.Element => {
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/openclaw/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/meta`
    )
      .then((r) => r.json() as Promise<SessionMeta>)
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setLoading(false));
  }, [agentId, sessionId]);

  return (
    <div
      className="flex h-full shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-[#0e0e10]"
      style={{ width: 240 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">Context</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {loading && (
        <div className="p-3 text-xs text-zinc-600">Loading...</div>
      )}

      {!loading && !meta && (
        <div className="p-3 text-xs text-zinc-600">No metadata available</div>
      )}

      {!loading && meta && (
        <div className="flex flex-col gap-4 p-3">
          {/* Session identity */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Session
            </span>
            <Row label="ID" value={meta.sessionId.slice(0, 16) + '…'} />
            <Row label="Key" value={meta.sessionKey} />
            <Row label="Type" value={meta.chatType} />
            {meta.displayName && <Row label="Name" value={meta.displayName} />}
          </div>

          {/* Model */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Model
            </span>
            <Row label="Provider" value={meta.modelProvider} />
            <Row label="Model" value={meta.model} />
          </div>

          {/* Channel */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Channel
            </span>
            <Row label="Channel" value={meta.channel} />
            {meta.originLabel && <Row label="Origin" value={meta.originLabel} />}
            {meta.deliveryTo && <Row label="Delivery" value={meta.deliveryTo} />}
          </div>

          {/* Status */}
          {meta.abortedLastRun && (
            <div className="rounded-md bg-red-950/40 px-2 py-1.5 text-xs text-red-400">
              ⚠ Last run aborted
            </div>
          )}

          {/* Last active */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Activity
            </span>
            <Row
              label="Last active"
              value={new Date(meta.updatedAt).toLocaleString()}
            />
          </div>

          {/* Skills */}
          {meta.skills.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Skills ({meta.skills.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {meta.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
