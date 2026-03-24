/**
 * GPU monitoring routes.
 *
 * Routes:
 * - GET /api/gpu/status - GPU stats + loaded models (Ollama/vLLM/ComfyUI)
 */

import { execSync } from 'node:child_process';

import { createLogger } from '@shared/utils/logger';

import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:gpu');

interface GpuInfo {
  index: number;
  name: string;
  memUsedMiB: number;
  memFreeMiB: number;
  memTotalMiB: number;
  utilizationGpu: number;
  utilizationMem: number;
  tempC: number;
  powerW: number;
}

interface OllamaModel {
  name: string;
  sizeBytes: number;
  sizeVramBytes: number;
  contextLength: number;
  expiresAt: string;
  family: string;
  quantization: string;
  parameterSize: string;
}

interface ServiceStatus {
  name: string;
  running: boolean;
  models?: OllamaModel[];
  loadedModel?: string;
  queuePending?: number;
  queueRunning?: number;
  vramUsedMiB?: number;
  error?: string;
}

interface GpuStatus {
  gpus: GpuInfo[];
  services: ServiceStatus[];
  fetchedAt: number;
}

function parseNvidiaSmi(): GpuInfo[] {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=index,name,memory.used,memory.free,memory.total,utilization.gpu,utilization.memory,temperature.gpu,power.draw --format=csv,noheader,nounits',
      { timeout: 5000 }
    ).toString().trim();

    return out.split('\n').map((line) => {
      const parts = line.split(',').map((s) => s.trim());
      return {
        index: parseInt(parts[0] ?? '0', 10),
        name: parts[1] ?? 'Unknown',
        memUsedMiB: parseInt(parts[2] ?? '0', 10),
        memFreeMiB: parseInt(parts[3] ?? '0', 10),
        memTotalMiB: parseInt(parts[4] ?? '0', 10),
        utilizationGpu: parseInt(parts[5] ?? '0', 10),
        utilizationMem: parseInt(parts[6] ?? '0', 10),
        tempC: parseInt(parts[7] ?? '0', 10),
        powerW: parseFloat(parts[8] ?? '0'),
      };
    });
  } catch (err) {
    logger.error('nvidia-smi failed:', err);
    return [];
  }
}

async function fetchOllama(): Promise<ServiceStatus> {
  try {
    const res = await fetch('http://localhost:11434/api/ps', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: unknown[] };
    const rawModels = data.models ?? [];

    const models: OllamaModel[] = rawModels.map((m: unknown) => {
      const model = m as Record<string, unknown>;
      const details = (model.details ?? {}) as Record<string, unknown>;
      return {
        name: String(model.name ?? ''),
        sizeBytes: Number(model.size ?? 0),
        sizeVramBytes: Number(model.size_vram ?? 0),
        contextLength: Number(model.context_length ?? 0),
        expiresAt: String(model.expires_at ?? ''),
        family: String(details.family ?? ''),
        quantization: String(details.quantization_level ?? ''),
        parameterSize: String(details.parameter_size ?? ''),
      };
    });

    return { name: 'Ollama', running: true, models };
  } catch (err) {
    return { name: 'Ollama', running: false, error: String(err) };
  }
}

async function fetchVllm(): Promise<ServiceStatus> {
  try {
    const res = await fetch('http://localhost:8000/v1/models', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id: string }[] };
    const model = data.data?.[0]?.id ?? 'unknown';
    return { name: 'vLLM', running: true, loadedModel: model };
  } catch {
    return { name: 'vLLM', running: false };
  }
}

async function fetchComfyui(): Promise<ServiceStatus> {
  try {
    const [statsRes, queueRes] = await Promise.all([
      fetch('http://localhost:8188/system_stats', { signal: AbortSignal.timeout(2000) }),
      fetch('http://localhost:8188/queue', { signal: AbortSignal.timeout(2000) }),
    ]);

    if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);

    const stats = (await statsRes.json()) as {
      system?: Record<string, unknown>;
      devices?: { vram_total?: number; vram_free?: number }[];
    };
    const queue = queueRes.ok
      ? ((await queueRes.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] })
      : null;

    const device = stats.devices?.[0];
    const vramUsedMiB = device
      ? Math.round(((Number(device.vram_total ?? 0) - Number(device.vram_free ?? 0)) / 1024 / 1024))
      : undefined;

    return {
      name: 'ComfyUI',
      running: true,
      vramUsedMiB,
      queuePending: queue?.queue_pending?.length ?? 0,
      queueRunning: queue?.queue_running?.length ?? 0,
    };
  } catch {
    return { name: 'ComfyUI', running: false };
  }
}

export function registerGpuRoutes(app: FastifyInstance): void {
  app.get('/api/gpu/status', async (): Promise<GpuStatus> => {
    const [gpus, ollama, vllm, comfyui] = await Promise.all([
      Promise.resolve(parseNvidiaSmi()),
      fetchOllama(),
      fetchVllm(),
      fetchComfyui(),
    ]);

    return {
      gpus,
      services: [ollama, vllm, comfyui],
      fetchedAt: Date.now(),
    };
  });
}
