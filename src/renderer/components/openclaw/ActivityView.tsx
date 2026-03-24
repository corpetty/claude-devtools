import { useEffect, useRef, useState } from 'react';

import {
  Activity,
  Bot,
  Brain,
  Clock,
  Cpu,
  Edit,
  Globe,
  RefreshCw,
  Share2,
  Terminal,
  WandSparkles,
  Zap,
} from 'lucide-react';

interface ActiveSession {
  agentId: string;
  sessionId: string;
  sessionKey: string;
  label: string;
  model: string;
  updatedAt: number;
  secondsSinceUpdate: number;
  status: 'active' | 'recent' | 'idle';
  lastMessages: Array<{
    role: string;
    timestamp: string;
    preview: string;
    isToolCall: boolean;
    isToolResult: boolean;
    toolName?: string;
    toolArgs?: string;
    toolResult?: string;
  }>;
  messageCount: number;
  contextTokens: number | null;
  totalTokens: number | null;
}

interface GPUStats {
  index: number;
  name: string;
  memUsedMiB: number;
  memTotalMiB: number;
  utilizationPct: number;
}

interface ActivityResponse {
  timestamp: string;
  activeSessions: ActiveSession[];
  gpuStats: GPUStats[];
}

// ─── Agent identity helpers ───────────────────────────────────────────────────

function isMainAgent(session: ActiveSession): boolean {
  return session.agentId === 'main';
}

function getModelProvider(model: string): 'anthropic' | 'ollama' | 'other' {
  if (model.startsWith('anthropic/') || model.includes('claude')) return 'anthropic';
  if (model.startsWith('ollama/') || model.includes('qwen') || model.includes('llama')) return 'ollama';
  return 'other';
}

function getModelShortName(model: string): string {
  const name = model.split('/').pop() || model;
  // truncate to ~18 chars
  return name.length > 18 ? name.slice(0, 17) + '…' : name;
}

// ─── Color scheme by agent type ───────────────────────────────────────────────
// Main agent: violet / purple
// Sub-agents: amber / orange
// We assign sub-agents distinct accent colors from a palette for differentiation

const SUB_ACCENT_PALETTE = [
  { border: 'border-amber-500/40',   bg: 'bg-amber-500/5',   text: 'text-amber-400',   dot: 'bg-amber-400',   lane: 'bg-amber-500' },
  { border: 'border-cyan-500/40',    bg: 'bg-cyan-500/5',    text: 'text-cyan-400',    dot: 'bg-cyan-400',    lane: 'bg-cyan-500' },
  { border: 'border-rose-500/40',    bg: 'bg-rose-500/5',    text: 'text-rose-400',    dot: 'bg-rose-400',    lane: 'bg-rose-500' },
  { border: 'border-lime-500/40',    bg: 'bg-lime-500/5',    text: 'text-lime-400',    dot: 'bg-lime-400',    lane: 'bg-lime-500' },
  { border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-500/5', text: 'text-fuchsia-400', dot: 'bg-fuchsia-400', lane: 'bg-fuchsia-500' },
];

const MAIN_ACCENT = {
  border: 'border-violet-500/40',
  bg: 'bg-violet-500/5',
  text: 'text-violet-400',
  dot: 'bg-violet-500',
  lane: 'bg-violet-500',
};

// ─── Tool color helpers ───────────────────────────────────────────────────────

function getToolColor(toolName?: string) {
  switch (toolName) {
    case 'exec':          return { cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: Terminal };
    case 'write':
    case 'edit':          return { cls: 'bg-blue-500/10 text-blue-300 border-blue-500/20',   icon: Edit };
    case 'web_fetch':
    case 'web_search':    return { cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: Globe };
    case 'sessions_spawn':
    case 'subagents':     return { cls: 'bg-violet-500/10 text-violet-300 border-violet-500/20', icon: Share2 };
    default:              return { cls: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/20',   icon: WandSparkles };
  }
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 2)  return 'now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const statusDotCls = {
  active: 'bg-emerald-500 animate-pulse',
  recent: 'bg-emerald-400',
  idle:   'bg-zinc-500',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelBadge({ model }: { model: string }) {
  const provider = getModelProvider(model);
  const name = getModelShortName(model);
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono ${
      provider === 'anthropic'
        ? 'bg-violet-500/15 text-violet-300'
        : provider === 'ollama'
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-zinc-700 text-zinc-400'
    }`}>
      {provider === 'anthropic' ? <Brain className="size-2.5" /> : <Bot className="size-2.5" />}
      {name}
    </span>
  );
}

interface SessionCardProps {
  session: ActiveSession;
  accent: typeof MAIN_ACCENT;
  isMain: boolean;
  onClick: () => void;
}

function TokenBar({ used, total, accent }: { used: number; total: number; accent: typeof MAIN_ACCENT }) {
  const pct = Math.min((used / total) * 100, 100);
  const high = pct > 80;
  const warn = pct > 60;
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider">context</span>
        <span className={`text-[9px] font-mono ${high ? 'text-red-400' : warn ? 'text-amber-400' : 'text-zinc-400'}`}>
          {(used / 1000).toFixed(0)}k / {(total / 1000).toFixed(0)}k ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            high ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SessionCard({ session, accent, isMain, onClick }: SessionCardProps) {
  // Last user message preview
  const lastUserMsg = [...session.lastMessages].reverse().find((m) => m.role === 'user');
  const lastToolCalls = session.lastMessages.filter((m) => m.isToolCall || m.isToolResult).slice(-3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:shadow-lg w-full ${accent.border} ${accent.bg} hover:brightness-110`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className={`block size-2 rounded-full shrink-0 ${statusDotCls[session.status]}`} />
        <span className={`rounded-sm px-1 py-px text-[8px] font-bold tracking-wider shrink-0 ${accent.text}`}>
          {isMain ? 'MAIN' : 'SUB'}
        </span>
        <span className={`truncate text-xs font-semibold flex-1 ${isMain ? 'text-violet-200' : 'text-zinc-200'}`}>
          {session.agentId}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-500">{relativeTime(session.updatedAt)}</span>
      </div>

      {/* Model + message count */}
      <div className="flex items-center gap-2 flex-wrap">
        <ModelBadge model={session.model} />
        <span className="text-[9px] text-zinc-500">{session.messageCount} msgs</span>
      </div>

      {/* Token fill bar */}
      {session.totalTokens != null && session.totalTokens > 0 && (
        <TokenBar
          used={session.totalTokens}
          total={session.contextTokens ?? session.totalTokens}
          accent={accent}
        />
      )}

      {/* Last user message */}
      {lastUserMsg && (
        <div className="rounded bg-blue-500/10 border border-blue-500/15 px-2 py-1">
          <div className="text-[9px] text-blue-400 mb-0.5">last user msg</div>
          <p className="text-[10px] text-zinc-300 leading-relaxed line-clamp-2 font-mono">
            {lastUserMsg.preview}
          </p>
        </div>
      )}

      {/* Recent tool calls */}
      {lastToolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lastToolCalls.map((msg, i) => {
            const { cls } = getToolColor(msg.toolName);
            return (
              <span key={i} className={`rounded border px-1 py-px text-[9px] font-mono ${cls}`}>
                {msg.toolName || '?'}
                {msg.toolArgs && (
                  <span className="ml-1 opacity-60 max-w-[80px] truncate inline-block align-bottom">
                    {msg.toolArgs.slice(0, 30)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}

// ─── Feed item ────────────────────────────────────────────────────────────────

interface FeedItem {
  sessionId: string;
  agentId: string;
  sessionLabel: string;
  model: string;
  role: string;
  timestamp: string;
  tsNum: number;
  preview: string;
  isToolCall: boolean;
  isToolResult: boolean;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  accent: typeof MAIN_ACCENT;
  isMain: boolean;
}

function FeedRow({ item }: { item: FeedItem }) {
  const { cls, icon: ToolIcon } = getToolColor(item.toolName);
  const isSpawn = item.toolName === 'sessions_spawn' || item.toolName === 'subagents';
  const isResult = item.isToolResult;

  // Tool result row: compact, indented, muted
  if (isResult) {
    const resultOk = !item.toolResult?.startsWith('❌');
    return (
      <div className="flex items-stretch gap-0 opacity-75">
        <div className="flex flex-col items-center mr-3 shrink-0">
          <div className={`w-0.5 flex-1 ${item.accent.lane} opacity-20`} />
          <div className={`size-1 rounded-full ${resultOk ? 'bg-emerald-500' : 'bg-red-500'} my-px shrink-0`} />
          <div className={`w-0.5 flex-1 ${item.accent.lane} opacity-20`} />
        </div>
        <div className={`flex-1 min-w-0 rounded-md px-2.5 py-1.5 mb-1 ml-2 border ${
          resultOk
            ? 'border-emerald-500/15 bg-emerald-500/5'
            : 'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[9px] font-mono font-semibold ${resultOk ? 'text-emerald-400' : 'text-red-400'}`}>
              ↳ {item.toolName ?? 'result'}
            </span>
            <span className="ml-auto text-[9px] text-zinc-600">{relativeTime(item.tsNum)}</span>
          </div>
          <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 font-mono whitespace-pre-wrap break-all">
            {item.toolResult || item.preview || '(empty)'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-0">
      {/* Colored left lane */}
      <div className="flex flex-col items-center mr-3 shrink-0">
        <div className={`w-0.5 flex-1 ${item.accent.lane} opacity-30`} />
        <div className={`size-1.5 rounded-full ${item.accent.dot} my-px shrink-0`} />
        <div className={`w-0.5 flex-1 ${item.accent.lane} opacity-30`} />
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 rounded-lg p-2.5 mb-1 ${
        isSpawn
          ? 'border border-violet-500/20 bg-violet-500/5'
          : item.isToolCall
            ? 'border border-zinc-600/30 bg-zinc-900/60'
            : item.role === 'user'
              ? 'border border-blue-500/20 bg-blue-500/5'
              : 'bg-zinc-900/40'
      }`}>
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {/* Agent pill */}
          <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${item.accent.text} ${item.accent.bg} border ${item.accent.border}`}>
            {item.isMain ? '🧠 main' : `🤖 ${item.agentId.slice(0, 8)}`}
          </span>
          <ModelBadge model={item.model} />
          {item.isToolCall ? (
            <span className={`flex items-center gap-0.5 rounded border px-1.5 py-px text-[10px] font-mono ${cls}`}>
              <ToolIcon className="size-2.5" />
              {item.toolName}
            </span>
          ) : (
            <span className={`rounded px-1.5 py-px text-[9px] font-semibold ${
              item.role === 'user'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : item.role === 'assistant'
                  ? 'bg-zinc-700 text-zinc-300'
                  : 'bg-zinc-800 text-zinc-500'
            }`}>
              {item.role === 'user' ? '👤 user' : item.role}
            </span>
          )}
          <span className="ml-auto text-[10px] text-zinc-600">{relativeTime(item.tsNum)}</span>
        </div>

        {/* Body */}
        {isSpawn ? (
          <div className="flex items-center gap-2 text-xs text-violet-300">
            <Share2 className="size-3 shrink-0" />
            <span className="font-mono">{item.preview}</span>
          </div>
        ) : item.isToolCall ? (
          /* Tool call: show args as the body */
          item.toolArgs ? (
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 font-mono break-all">
              {item.toolArgs}
            </p>
          ) : item.preview ? (
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2 font-mono">
              {item.preview}
            </p>
          ) : null
        ) : (
          <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 font-mono">
            {item.preview || <span className="text-zinc-600 italic">no text content</span>}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ActivityViewProps {
  onSelectSession: (agentId: string, sessionId: string) => void;
  onSwitchToSessions?: boolean;
}

export const ActivityView = ({ onSelectSession }: ActivityViewProps): React.JSX.Element => {
  const [data, setData]               = useState<ActivityResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const subAccentMap                  = useRef<Map<string, typeof MAIN_ACCENT>>(new Map());
  let subIdx = 0;

  const getAccent = (session: ActiveSession) => {
    if (isMainAgent(session)) return MAIN_ACCENT;
    if (!subAccentMap.current.has(session.sessionId)) {
      subAccentMap.current.set(
        session.sessionId,
        SUB_ACCENT_PALETTE[subIdx % SUB_ACCENT_PALETTE.length]
      );
      subIdx++;
    }
    return subAccentMap.current.get(session.sessionId)!;
  };

  const fetchActivity = async () => {
    try {
      const res  = await fetch('/api/openclaw/activity');
      const json = (await res.json()) as ActivityResponse;
      setData(json);
      setLastUpdated(new Date());
    } catch {
      console.error('Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-zinc-500">
        <RefreshCw className="mb-4 size-8 animate-spin text-zinc-600" />
        <p className="text-sm">Loading activity…</p>
      </div>
    );
  }

  // Assign accents to all sessions (deterministic within render)
  const sessionsWithAccent = data.activeSessions.map((s) => ({
    session: s,
    accent: getAccent(s),
    isMain: isMainAgent(s),
  }));

  // Sort: latest activity first
  const sortedSessions = [...sessionsWithAccent].sort(
    (a, b) => b.session.updatedAt - a.session.updatedAt
  );

  // Build chronological feed
  const feedItems: FeedItem[] = sessionsWithAccent
    .flatMap(({ session, accent, isMain }) =>
      session.lastMessages.map((msg) => ({
        sessionId:    session.sessionId,
        agentId:      session.agentId,
        sessionLabel: session.label,
        model:        session.model,
        role:         msg.role,
        timestamp:    msg.timestamp,
        tsNum:        new Date(msg.timestamp).getTime() || session.updatedAt,
        preview:      msg.preview,
        isToolCall:   msg.isToolCall,
        isToolResult: msg.isToolResult,
        toolName:     msg.toolName,
        toolArgs:     msg.toolArgs,
        toolResult:   msg.toolResult,
        accent,
        isMain,
      }))
    )
    .sort((a, b) => b.tsNum - a.tsNum)
    .slice(0, 60);

  const hasSessions = data.activeSessions.length > 0;
  const mainCount = sessionsWithAccent.filter((s) => s.isMain).length;
  const subCount  = sessionsWithAccent.length - mainCount;

  return (
    <div className="flex h-full flex-col bg-[#111113]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Activity className="size-5 text-zinc-400" />
          <h1 className="text-sm font-semibold text-zinc-200">Agent Activity</h1>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 rounded bg-violet-500/15 px-2 py-0.5 text-violet-300">
              <Brain className="size-3" /> {mainCount} main
            </span>
            <span className="flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
              <Bot className="size-3" /> {subCount} sub
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Zap className="size-3" />
            {lastUpdated ? lastUpdated.toLocaleTimeString() : '-'}
          </span>
          <button
            onClick={fetchActivity}
            className="rounded bg-zinc-800 px-2 py-1 transition-colors hover:bg-zinc-700"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
      </div>

      {/* ── GPU Strip ──────────────────────────────────────────────────────── */}
      {data.gpuStats.length > 0 && (
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Cpu className="size-3.5" /> GPU Resources
          </div>
          <div className="flex flex-wrap gap-3">
            {data.gpuStats.map((gpu) => {
              const pct  = (gpu.memUsedMiB / gpu.memTotalMiB) * 100;
              const high = pct > 80;
              return (
                <div key={gpu.index} className="flex flex-1 min-w-[190px] flex-col rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-300">
                      GPU {gpu.index}
                    </span>
                    <span className={`text-[10px] ${high ? 'text-amber-400' : 'text-zinc-500'}`}>
                      {gpu.utilizationPct}% util
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          high ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-[10px] text-zinc-400">
                      {(gpu.memUsedMiB / 1024).toFixed(1)} / {(gpu.memTotalMiB / 1024).toFixed(0)} GB
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Body: sidebar + feed ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Session sidebar */}
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Clock className="mr-1.5 inline size-3" />Sessions
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {!hasSessions ? (
              <div className="py-8 text-center text-sm text-zinc-600">
                <Activity className="mx-auto mb-3 size-8 opacity-20" />
                No recent sessions
              </div>
            ) : (
              sortedSessions.map(({ session, accent, isMain }) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  accent={accent}
                  isMain={isMain}
                  onClick={() => {
                    onSelectSession(session.agentId, session.sessionId);
                    window.dispatchEvent(
                      new CustomEvent('openclaw-switch-to-view', { detail: { view: 'sessions' } })
                    );
                  }}
                />
              ))
            )}
          </div>

          {/* Legend */}
          <div className="border-t border-zinc-800 px-3 py-2.5 text-[10px] text-zinc-600 space-y-1">
            <div className="font-semibold uppercase tracking-wider mb-1">Legend</div>
            <div className="flex items-center gap-1.5"><Brain className="size-3 text-violet-400" /><span className="text-violet-400">Main agent (Claude)</span></div>
            <div className="flex items-center gap-1.5"><Bot className="size-3 text-amber-400" /><span className="text-amber-400">Sub-agent (local LLM)</span></div>
            <div className="flex items-center gap-1.5"><Share2 className="size-3 text-violet-300" /><span>Spawn / delegation event</span></div>
          </div>
        </div>

        {/* Live feed */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-zinc-800 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <WandSparkles className="mr-1.5 inline size-3" />Live Crosstalk Feed
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!hasSessions ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                Waiting for agent activity…
              </div>
            ) : feedItems.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                No messages yet
              </div>
            ) : (
              <div className="flex flex-col">
                {feedItems.map((item, idx) => (
                  <FeedRow key={`${item.sessionId}-${idx}`} item={item} />
                ))}
                {feedItems.length >= 60 && (
                  <div className="mt-3 text-center text-[10px] text-zinc-600">
                    Showing 60 most recent entries
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
