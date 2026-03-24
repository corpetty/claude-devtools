import { useState } from 'react';

import { PanelRight } from 'lucide-react';

import { ActivityView } from './ActivityView';
import { AgentList } from './AgentList';
import { CronJobsPanel } from './CronJobsPanel';
import { GpuPanel } from './GpuPanel';
import { SessionContextSidebar } from './SessionContextSidebar';
import { SessionList } from './SessionList';
import { SessionView } from './SessionView';

type ViewMode = 'sessions' | 'crons' | 'activity' | 'gpu';

export const OpenClawView = (): React.JSX.Element => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [showContext, setShowContext] = useState(false);

  const handleSelectAgent = (id: string): void => {
    setSelectedAgentId(id);
    setSelectedSessionId(null);
    setViewMode('sessions');
  };

  const handleShowCrons = (): void => {
    setSelectedAgentId(null);
    setSelectedSessionId(null);
    setViewMode('crons');
    setShowContext(false);
  };

  const handleShowActivity = (): void => {
    setSelectedAgentId(null);
    setSelectedSessionId(null);
    setViewMode('activity');
    setShowContext(false);
  };

  const handleShowGpu = (): void => {
    setSelectedAgentId(null);
    setSelectedSessionId(null);
    setViewMode('gpu');
    setShowContext(false);
  };

  const handleSelectSession = (
    agentId: string | null,
    sessionId: string,
    switchToSessions: boolean = true
  ): void => {
    if (agentId) setSelectedAgentId(agentId);
    setSelectedSessionId(sessionId);
    if (switchToSessions) {
      setViewMode('sessions');
    }
    setShowContext(true);
  };

  const showContextPanel =
    showContext && selectedAgentId != null && selectedSessionId != null;

  return (
    <div className="flex size-full bg-[#111113]">
      {/* Left sidebar - agent list */}
      <div className="flex shrink-0 flex-col border-r border-zinc-800" style={{ width: 200 }}>
        <AgentList
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onShowCrons={handleShowCrons}
          onShowActivity={handleShowActivity}
          onShowGpu={handleShowGpu}
        />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar shown when a session is selected */}
        {selectedSessionId && selectedAgentId && (
          <div className="flex shrink-0 items-center justify-end border-b border-zinc-800 px-2 py-1">
            <button
              type="button"
              title={showContext ? 'Hide context' : 'Show context'}
              onClick={() => setShowContext((v) => !v)}
              className={`rounded p-1 transition-colors ${
                showContext
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              <PanelRight className="size-4" />
            </button>
          </div>
        )}

        {/* Content area */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {viewMode === 'gpu' ? (
              <GpuPanel />
            ) : viewMode === 'crons' ? (
              <CronJobsPanel />
            ) : viewMode === 'activity' ? (
              <ActivityView
                onSelectSession={(agentId, sessionId) => {
                  setSelectedAgentId(agentId);
                  setSelectedSessionId(sessionId);
                  setShowContext(true);
                }}
              />
            ) : !selectedAgentId ? (
              <div className="flex flex-1 items-center justify-center text-zinc-500">
                Select an agent to view sessions
              </div>
            ) : !selectedSessionId ? (
              <SessionList
                agentId={selectedAgentId}
                selectedSessionId={selectedSessionId}
                onSelectSession={(id) => handleSelectSession(selectedAgentId, id)}
              />
            ) : (
              <SessionView agentId={selectedAgentId} sessionId={selectedSessionId} />
            )}
          </div>

          {/* Context panel */}
          {showContextPanel && (
            <SessionContextSidebar
              agentId={selectedAgentId}
              sessionId={selectedSessionId}
              onClose={() => setShowContext(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
