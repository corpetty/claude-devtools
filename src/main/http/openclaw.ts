/**
 * HTTP route handlers for OpenClaw monitoring.
 *
 * Routes:
 * - GET /api/openclaw/agents - List all agents
 * - GET /api/openclaw/agents/:agentId/sessions - Sessions for an agent
 * - GET /api/openclaw/agents/:agentId/sessions/:sessionId/messages - Session messages
 * - GET /api/openclaw/crons - Cron jobs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { createLogger } from '@shared/utils/logger';

import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:openclaw');

const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.openclaw');

interface SessionEntry {
  sessionId: string;
  updatedAt: number;
  sessionFile: string;
  modelProvider?: string;
  model?: string;
  chatType?: string;
  channel?: string;
  displayName?: string;
  subject?: string;
  origin?: { label?: string };
  abortedLastRun?: boolean;
  contextTokens?: number;
  totalTokens?: number;
}

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

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Query LCM SQLite DB for messages belonging to a given sessionId (UUID).
 * Returns messages in chronological order, skipping system messages.
 */
function queryLcmMessages(
  lcmDbPath: string,
  sessionId: string
): { role: string; timestamp: string; contentPreview: string }[] {
  if (!fs.existsSync(lcmDbPath)) return [];
  try {
    const sql = `
      SELECT m.role, m.created_at, m.content
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.conversation_id
      WHERE c.session_id = '${sessionId.replace(/'/g, "''")}'
        AND m.role != 'system'
      ORDER BY m.conversation_id, m.seq;
    `.trim().replace(/\n\s+/g, ' ');
    const out = execSync(`sqlite3 "${lcmDbPath}" "${sql}"`, { maxBuffer: 10 * 1024 * 1024 });
    const rows = String(out).trim().split('\n').filter(Boolean);
    return rows.map((row) => {
      const parts = row.split('|');
      const role = parts[0] ?? 'unknown';
      const ts = parts[1] ?? '';
      const content = parts.slice(2).join('|');
      let text = content;
      // Try to parse JSON content (LCM stores content as JSON string sometimes)
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'string') text = parsed;
        else if (Array.isArray(parsed)) {
          text = parsed
            .map((b: unknown) => {
              if (typeof b === 'string') return b;
              if (b && typeof b === 'object' && 'text' in (b as Record<string, unknown>))
                return (b as Record<string, unknown>).text;
              return '';
            })
            .join('');
        }
      } catch {
        // raw text is fine
      }
      return {
        role,
        timestamp: ts ? new Date(ts).toISOString() : '',
        contentPreview: String(text).slice(0, 500).replace(/\s+/g, ' ').trim() || '[no content]',
      };
    });
  } catch {
    return [];
  }
}

export function registerOpenClawRoutes(app: FastifyInstance): void {
  // List all agents
  app.get('/api/openclaw/agents', async () => {
    try {
      const agentsDir = path.join(OPENCLAW_HOME, 'agents');
      if (!fs.existsSync(agentsDir)) return [];

      const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
      const agents = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const agentId = entry.name;
        const sessionsFile = path.join(agentsDir, agentId, 'sessions', 'sessions.json');
        const sessions = readJsonSafe<Record<string, SessionEntry>>(sessionsFile, {});
        const sessionList = Object.values(sessions);

        // Find most recent session for timestamp and model
        let latestUpdatedAt = 0;
        let latestModel = '';
        for (const s of sessionList) {
          if (s.updatedAt > latestUpdatedAt) {
            latestUpdatedAt = s.updatedAt;
            latestModel = s.model ?? '';
          }
        }

        agents.push({
          id: agentId,
          sessionCount: sessionList.length,
          latestModel,
          latestUpdatedAt,
        });
      }

      // Sort by most recently active
      agents.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
      return agents;
    } catch (error) {
      logger.error('Error listing OpenClaw agents:', error);
      return [];
    }
  });

  // Sessions for an agent
  app.get<{ Params: { agentId: string } }>(
    '/api/openclaw/agents/:agentId/sessions',
    async (request) => {
      try {
        const { agentId } = request.params;
        const sessionsFile = path.join(
          OPENCLAW_HOME,
          'agents',
          agentId,
          'sessions',
          'sessions.json'
        );
        const sessions = readJsonSafe<Record<string, SessionEntry>>(sessionsFile, {});
        const list = Object.entries(sessions).map(([key, s]) => ({
          key,
          sessionId: s.sessionId,
          updatedAt: s.updatedAt,
          model: s.model ?? '',
          modelProvider: s.modelProvider ?? '',
          chatType: s.chatType ?? 'direct',
          channel: s.channel ?? '',
          displayName: s.displayName ?? '',
          subject: s.subject ?? '',
          originLabel: s.origin?.label ?? '',
          abortedLastRun: s.abortedLastRun ?? false,
          sessionFile: s.sessionFile,
        }));

        // Sort by most recent first
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        return list;
      } catch (error) {
        logger.error('Error listing OpenClaw sessions:', error);
        return [];
      }
    }
  );

  // Messages for a session
  app.get<{ Params: { agentId: string; sessionId: string } }>(
    '/api/openclaw/agents/:agentId/sessions/:sessionId/messages',
    async (request) => {
      try {
        const { agentId, sessionId } = request.params;
        const sessionsFile = path.join(
          OPENCLAW_HOME,
          'agents',
          agentId,
          'sessions',
          'sessions.json'
        );
        const sessions = readJsonSafe<Record<string, SessionEntry>>(sessionsFile, {});

        // Find session by sessionId
        const entry = Object.values(sessions).find((s) => s.sessionId === sessionId);
        if (!entry) {
          return { sessionId, createdAt: null, model: '', messages: [], modelChanges: [] };
        }

        const sessionFile = entry.sessionFile;
        if (!fs.existsSync(sessionFile)) {
          // Try LCM fallback immediately
          if (entry.sessionId) {
            const lcmDbPath = path.join(OPENCLAW_HOME, 'lcm.db');
            const lcmMessages = queryLcmMessages(lcmDbPath, entry.sessionId);
            if (lcmMessages.length > 0) {
              return {
                sessionId,
                createdAt: null,
                model: entry.model ?? '',
                messages: lcmMessages,
                modelChanges: [],
                source: 'lcm',
              };
            }
          }
          return {
            sessionId,
            createdAt: null,
            model: entry.model ?? '',
            messages: [],
            modelChanges: [],
          };
        }

        const raw = fs.readFileSync(sessionFile, 'utf8');
        const lines = raw.split('\n').filter((l) => l.trim());

        let createdAt: string | null = null;
        const model = entry.model ?? '';
        const messages: {
          role: string;
          timestamp: string;
          contentPreview: string;
        }[] = [];
        const modelChanges: {
          timestamp: string;
          provider: string;
          modelId: string;
        }[] = [];

        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const type = obj.type as string;

            if (type === 'session') {
              createdAt = (obj.timestamp as string) ?? null;
            } else if (type === 'model_change') {
              const mcTs = obj.timestamp;
              modelChanges.push({
                timestamp: mcTs ? new Date(mcTs as string | number).toISOString() : '',
                provider: (obj.provider as string) ?? '',
                modelId: (obj.modelId as string) ?? '',
              });
            } else if (type === 'message') {
              const msg = obj.message as Record<string, unknown> | undefined;
              if (msg) {
                const role = (msg.role as string) ?? 'unknown';
                const rawTs = msg.timestamp ?? obj.timestamp;
                const timestamp = rawTs ? new Date(rawTs as string | number).toISOString() : '';
                let content = '';
                const rawContent = msg.content;
                if (typeof rawContent === 'string') {
                  content = rawContent;
                } else if (Array.isArray(rawContent)) {
                  // Extract text from content blocks
                  for (const block of rawContent) {
                    if (typeof block === 'string') {
                      content += block;
                    } else if (
                      block &&
                      typeof block === 'object' &&
                      'text' in (block as Record<string, unknown>)
                    ) {
                      content += (block as Record<string, unknown>).text;
                    }
                  }
                }

                messages.push({
                  role,
                  timestamp,
                  contentPreview: content.slice(0, 500) || '[no content]',
                });
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }

        // LCM fallback: if JSONL had no messages, query lcm.db by sessionId
        if (messages.length === 0 && entry.sessionId) {
          const lcmDbPath = path.join(OPENCLAW_HOME, 'lcm.db');
          const lcmMessages = queryLcmMessages(lcmDbPath, entry.sessionId);
          if (lcmMessages.length > 0) {
            return { sessionId, createdAt, model, messages: lcmMessages, modelChanges, source: 'lcm' };
          }
        }

        return { sessionId, createdAt, model, messages, modelChanges };
      } catch (error) {
        logger.error('Error reading OpenClaw session messages:', error);
        return {
          sessionId: request.params.sessionId,
          createdAt: null,
          model: '',
          messages: [],
          modelChanges: [],
        };
      }
    }
  );

  // Session metadata (for context panel)
  app.get<{ Params: { agentId: string; sessionId: string } }>(
    '/api/openclaw/agents/:agentId/sessions/:sessionId/meta',
    async (request) => {
      try {
        const { agentId, sessionId } = request.params;
        const sessionsFile = path.join(OPENCLAW_HOME, 'agents', agentId, 'sessions', 'sessions.json');
        const sessions = readJsonSafe<Record<string, SessionEntry & {
          skillsSnapshot?: { skills?: Array<{ name: string }> };
          deliveryContext?: { channel?: string; to?: string };
          modelProvider?: string;
          lastTo?: string;
        }>>(sessionsFile, {});

        const entry = Object.entries(sessions).find(([, s]) => s.sessionId === sessionId);
        if (!entry) return null;

        const [sessionKey, s] = entry;
        const skills = (s.skillsSnapshot?.skills ?? []).map((sk) => sk.name);

        return {
          sessionKey,
          sessionId: s.sessionId,
          channel: s.channel ?? '',
          chatType: s.chatType ?? 'direct',
          model: s.model ?? '',
          modelProvider: s.modelProvider ?? '',
          originLabel: s.origin?.label ?? '',
          displayName: s.displayName ?? s.subject ?? '',
          deliveryTo: s.deliveryContext?.to ?? s.lastTo ?? '',
          abortedLastRun: s.abortedLastRun ?? false,
          updatedAt: s.updatedAt,
          skills,
        };
      } catch (error) {
        logger.error('Error reading OpenClaw session meta:', error);
        return null;
      }
    }
  );

  // Cron jobs
  app.get('/api/openclaw/crons', async () => {
    try {
      const jobsFile = path.join(OPENCLAW_HOME, 'cron', 'jobs.json');
      const data = readJsonSafe<{ version?: number; jobs?: CronJob[] }>(jobsFile, { jobs: [] });
      return data.jobs ?? [];
    } catch (error) {
      logger.error('Error reading OpenClaw cron jobs:', error);
      return [];
    }
  });

  // Activity monitoring endpoint
  app.get('/api/openclaw/activity', async () => {
    try {
      const { execSync } = await import('node:child_process');
      const agentsDir = path.join(OPENCLAW_HOME, 'agents');
      const nowTs = Date.now();
      const thirtyMinMinMs = 30 * 60 * 1000;
      const sessionsList: Record<string, any[]> = {};

      if (fs.existsSync(agentsDir)) {
        const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const agentId = entry.name;
          const sessionsFile = path.join(agentsDir, agentId, 'sessions', 'sessions.json');
          const sessions = readJsonSafe<Record<string, SessionEntry>>(sessionsFile, {});
          for (const [, s] of Object.entries(sessions)) {
            if (s.updatedAt - nowTs > thirtyMinMinMs) continue;
            if (!sessionsList[agentId]) sessionsList[agentId] = [];
            sessionsList[agentId].push({
              agentId,
              sessionId: s.sessionId,
              updatedAt: s.updatedAt,
              model: s.model ?? '',
              sessionFile: s.sessionFile,
            });
          }
        }
      }

      const activeSessions: any[] = [];
      for (const [agentId, sessions] of Object.entries(sessionsList)) {
        for (const s of sessions) {
          if (!fs.existsSync(s.sessionFile)) continue;
          let raw = '';
          try {
            raw = fs.readFileSync(s.sessionFile, 'utf8');
          } catch {}
          const lines = raw.split('\n').filter((l) => l.trim());
          type Message = {
            role: string;
            timestamp: string;
            preview: string;
            isToolCall: boolean;
            isToolResult: boolean;
            toolName?: string;
            toolArgs?: string;   // short summary of key args
            toolResult?: string; // short summary of result
          };
          const lastMessages: Message[] = [];
          let messageCount = 0;

          // Build an id→parsed-object index for cheap parent lookups
          const objIndex = new Map<string, Record<string, unknown>>();
          for (const line of lines) {
            try {
              const o = JSON.parse(line) as Record<string, unknown>;
              if (o.id) objIndex.set(o.id as string, o);
            } catch { /* skip */ }
          }

          // Helper: summarise tool arguments into a short string
          function summariseArgs(args: Record<string, unknown>, name: string): string {
            if (!args || typeof args !== 'object') return '';
            switch (name) {
              case 'exec': {
                const cmd = String(args.command ?? '').replace(/\s+/g, ' ').trim();
                return cmd.slice(0, 120);
              }
              case 'read': {
                const fp = args.file_path ?? args.path ?? '';
                return String(fp);
              }
              case 'write':
              case 'edit': {
                const fp = args.file_path ?? args.path ?? '';
                return String(fp);
              }
              case 'web_search': return String(args.query ?? '').slice(0, 100);
              case 'web_fetch':  return String(args.url ?? '').slice(0, 100);
              case 'sessions_spawn': return String(args.label ?? args.task ?? '').slice(0, 100);
              case 'memory_search': return String(args.query ?? '').slice(0, 100);
              default: {
                // Generic: show first string-valued key
                for (const [k, v] of Object.entries(args)) {
                  if (typeof v === 'string' && v.length > 0) return `${k}: ${v.slice(0, 80)}`;
                }
                return JSON.stringify(args).slice(0, 100);
              }
            }
          }

          for (let i = lines.length - 1; i >= 0 && lastMessages.length < 20; i--) {
            try {
              const obj = JSON.parse(lines[i]) as Record<string, unknown>;
              if (obj.type === 'session') continue;
              messageCount++;
              const msg = obj.message as Record<string, unknown>;
              if (msg === undefined) continue;
              const role = (msg.role as string) ?? 'unknown';
              const rawTs = msg.timestamp ?? obj.timestamp;
              const timestamp = rawTs ? new Date(rawTs as string | number).toISOString() : '';

              // ── Collect text content ──────────────────────────────────────
              let content = '';
              const rawContent = msg.content;
              if (typeof rawContent === 'string') {
                content = rawContent;
              } else if (Array.isArray(rawContent)) {
                for (const block of rawContent) {
                  if (typeof block === 'string') content += block;
                  else if (block && typeof block === 'object') {
                    const b = block as any;
                    if (b.type === 'text' && b.text) content += b.text;
                  }
                }
              }

              // ── Detect tool calls in assistant messages ───────────────────
              let isToolCall = false;
              let isToolResult = false;
              let toolName: string | undefined;
              let toolArgs: string | undefined;
              let toolResult: string | undefined;

              if (role === 'assistant' && Array.isArray(rawContent)) {
                // Collect all toolCall blocks from this assistant message
                const toolCalls: any[] = [];
                for (const block of rawContent as any[]) {
                  if (block && typeof block === 'object' && block.type === 'toolCall') {
                    toolCalls.push(block);
                  }
                }
                if (toolCalls.length > 0) {
                  isToolCall = true;
                  // Primary tool (first one, usually there's just one per turn)
                  const primary = toolCalls[0];
                  toolName = primary.name ?? primary.id;
                  const args = primary.arguments ?? primary.input ?? {};
                  toolArgs = summariseArgs(args, toolName ?? '');
                  // If multiple tools called, append count
                  if (toolCalls.length > 1) {
                    toolArgs = `[${toolCalls.length} calls] ` + toolCalls.map((t: any) => t.name ?? '?').join(', ');
                  }
                }
              }

              // ── Detect toolResult messages ────────────────────────────────
              if (role === 'toolResult') {
                isToolResult = true;
                toolName = (msg.toolName as string) ?? undefined;
                // Extract result text
                let resultText = '';
                if (Array.isArray(rawContent)) {
                  for (const block of rawContent as any[]) {
                    if (block && typeof block === 'object' && block.type === 'text') {
                      resultText += block.text;
                    } else if (typeof block === 'string') {
                      resultText += block;
                    }
                  }
                }
                // Also check details.aggregated for exec results
                const details = msg.details as any;
                if (!resultText && details?.aggregated) resultText = details.aggregated;
                toolResult = resultText.replace(/\s+/g, ' ').trim().slice(0, 200);
                // If this is an error result, flag it
                if (msg.isError) toolResult = '❌ ' + toolResult;
              }

              // ── Build preview text ────────────────────────────────────────
              let previewText = content;
              if (role === 'user') {
                previewText = previewText.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>/g, '').trim();
                previewText = previewText.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```\s*\n/g, '').trim();
                previewText = previewText.replace(/Sender \(untrusted metadata\):[\s\S]*?```\s*\n/g, '').trim();
                previewText = previewText.replace(/\[media attached:[^\]]+\]/g, '[📎 media]').trim();
              }
              if (isToolCall && !previewText) {
                previewText = toolArgs ?? toolName ?? '';
              }
              if (isToolResult) {
                previewText = toolResult ?? '';
              }

              lastMessages.push({
                role,
                timestamp,
                preview: previewText.slice(0, 200).replace(/\s+/g, ' ').trim() || '',
                isToolCall,
                isToolResult,
                toolName,
                toolArgs,
                toolResult,
              });
            } catch {
              continue;
            }
          }

          if (lastMessages.length === 0) continue;

          const status = (() => {
            const msgTs = lastMessages[0].timestamp;
            const tsNum = msgTs ? new Date(msgTs).getTime() : 0;
            if (tsNum === 0) return 'idle';
            if (nowTs - tsNum < 60000) return 'active';
            if (nowTs - tsNum < 600000) return 'recent';
            return 'idle';
          })();

          activeSessions.push({
            agentId,
            sessionId: s.sessionId,
            sessionKey: `agent:${agentId}:${s.sessionId}`,
            label: `Session ${s.sessionId.slice(0, 8)}`,
            model: s.model,
            updatedAt: s.updatedAt,
            secondsSinceUpdate: Math.floor((nowTs - s.updatedAt) / 1000),
            status: status as 'active' | 'recent' | 'idle',
            lastMessages: lastMessages.reverse(),
            messageCount,
            contextTokens: s.contextTokens ?? null,
            totalTokens: s.totalTokens ?? null,
          });
        }
      }

      let gpuStats = [];
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv,noheader'
        );
        const lines = String(out).trim().split('\n');
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 5) {
            gpuStats.push({
              index: parseInt(parts[0].trim(), 10),
              name: parts[1].trim(),
              memUsedMiB: parseInt(parts[2].trim(), 10),
              memTotalMiB: parseInt(parts[3].trim(), 10),
              utilizationPct: parseInt(parts[4].trim(), 10),
            });
          }
        }
      } catch {
        gpuStats = [];
      }

      return {
        timestamp: new Date().toISOString(),
        activeSessions,
        gpuStats,
      };
    } catch (error) {
      logger.error('Error in OpenClaw activity endpoint:', error);
      return { timestamp: new Date().toISOString(), activeSessions: [], gpuStats: [] };
    }
  });

  logger.info('OpenClaw routes registered');
}
