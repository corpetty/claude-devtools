import { useEffect, useState } from 'react';

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

function fmtMiB(mib: number): string {
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GB`;
  return `${mib} MB`;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${bytes} B`;
}

function relativeExpiry(isoStr: string): string {
  if (!isoStr) return '';
  const ms = new Date(isoStr).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function BarMeter({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
}): React.JSX.Element {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-8 shrink-0 text-right text-[11px] text-zinc-500">{label}</span>}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] text-zinc-400">{pct.toFixed(0)}%</span>
    </div>
  );
}

function GpuCard({ gpu }: { gpu: GpuInfo }): React.JSX.Element {
  const vramPct = (gpu.memUsedMiB / gpu.memTotalMiB) * 100;
  const vramColor =
    vramPct > 90 ? 'bg-red-500' : vramPct > 75 ? 'bg-yellow-500' : 'bg-emerald-500';
  const utilColor =
    gpu.utilizationGpu > 90
      ? 'bg-red-500'
      : gpu.utilizationGpu > 60
        ? 'bg-yellow-500'
        : 'bg-blue-500';
  const tempColor = gpu.tempC > 85 ? 'text-red-400' : gpu.tempC > 70 ? 'text-yellow-400' : 'text-zinc-400';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">
          GPU {gpu.index} <span className="text-xs text-zinc-500">{gpu.name}</span>
        </span>
        <div className="flex items-center gap-3 text-[11px]">
          <span className={tempColor}>{gpu.tempC}°C</span>
          <span className="text-zinc-500">{gpu.powerW.toFixed(0)}W</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div>
          <div className="mb-0.5 flex justify-between text-[11px]">
            <span className="text-zinc-500">VRAM</span>
            <span className="text-zinc-400">
              {fmtMiB(gpu.memUsedMiB)} / {fmtMiB(gpu.memTotalMiB)}
              <span className="ml-1 text-zinc-600">({fmtMiB(gpu.memFreeMiB)} free)</span>
            </span>
          </div>
          <BarMeter value={gpu.memUsedMiB} max={gpu.memTotalMiB} color={vramColor} />
        </div>

        <BarMeter value={gpu.utilizationGpu} max={100} color={utilColor} label="GPU" />
        <BarMeter value={gpu.utilizationMem} max={100} color="bg-purple-500" label="Mem" />
      </div>
    </div>
  );
}

function ServiceBadge({ service }: { service: ServiceStatus }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1">
      <div
        className={`size-1.5 rounded-full ${service.running ? 'bg-emerald-400' : 'bg-zinc-600'}`}
      />
      <span className={`text-[11px] font-medium ${service.running ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {service.name}
      </span>
      {service.running && service.name === 'ComfyUI' && (
        <span className="text-[10px] text-zinc-500">
          {(service.queueRunning ?? 0) + (service.queuePending ?? 0) > 0
            ? `${service.queueRunning}r/${service.queuePending}q`
            : 'idle'}
        </span>
      )}
      {service.running && service.name === 'vLLM' && service.loadedModel && (
        <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{service.loadedModel}</span>
      )}
    </div>
  );
}

function OllamaModelRow({ model }: { model: OllamaModel }): React.JSX.Element {
  const expires = relativeExpiry(model.expiresAt);
  const shortName = model.name.replace(/:latest$/, '');

  return (
    <div className="flex items-center gap-2 rounded-md bg-zinc-800/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-200">{shortName}</span>
          {model.parameterSize && (
            <span className="shrink-0 rounded bg-zinc-700/60 px-1 py-0.5 text-[10px] text-zinc-400">
              {model.parameterSize}
            </span>
          )}
          {model.quantization && model.quantization !== 'unknown' && (
            <span className="shrink-0 rounded bg-zinc-700/40 px-1 py-0.5 text-[10px] text-zinc-500">
              {model.quantization}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-zinc-500">
          <span>VRAM: {fmtBytes(model.sizeVramBytes)}</span>
          {model.contextLength > 0 && <span>ctx: {model.contextLength.toLocaleString()}</span>}
          {model.family && <span>{model.family}</span>}
        </div>
      </div>
      {expires && (
        <span className="shrink-0 rounded bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-500">
          evicts {expires}
        </span>
      )}
    </div>
  );
}

export const GpuPanel = (): React.JSX.Element => {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const fetchStatus = (): void => {
    fetch('/api/gpu/status')
      .then((r) => r.json() as Promise<GpuStatus>)
      .then((data) => {
        setStatus(data);
        setLastUpdated(Date.now());
        setError(null);
      })
      .catch((err) => setError(String(err)));
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const ollamaService = status?.services.find((s) => s.name === 'Ollama');
  const otherServices = status?.services.filter((s) => s.name !== 'Ollama') ?? [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">GPU Monitor</h2>
        <div className="flex items-center gap-2">
          {lastUpdated > 0 && (
            <span className="text-[11px] text-zinc-600">
              updated {Math.round((Date.now() - lastUpdated) / 1000)}s ago
            </span>
          )}
          <button
            type="button"
            onClick={fetchStatus}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            ↺
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* GPU cards */}
      {status?.gpus && status.gpus.length > 0 && (
        <div className="space-y-3">
          {status.gpus.map((gpu) => (
            <GpuCard key={gpu.index} gpu={gpu} />
          ))}
        </div>
      )}

      {/* Service status badges */}
      {status?.services && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">Services</div>
          <div className="flex flex-wrap gap-2">
            {status.services.map((svc) => (
              <ServiceBadge key={svc.name} service={svc} />
            ))}
          </div>
        </div>
      )}

      {/* Loaded Ollama models */}
      {ollamaService?.running && ollamaService.models && ollamaService.models.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">
            Loaded in Ollama ({ollamaService.models.length})
          </div>
          <div className="space-y-1.5">
            {ollamaService.models.map((m) => (
              <OllamaModelRow key={m.name} model={m} />
            ))}
          </div>
        </div>
      )}

      {ollamaService?.running && (!ollamaService.models || ollamaService.models.length === 0) && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-4 text-center text-xs text-zinc-600">
          No models currently loaded in Ollama
        </div>
      )}

      {/* vLLM loaded model detail */}
      {status?.services.find((s) => s.name === 'vLLM' && s.running && s.loadedModel) && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">Loaded in vLLM</div>
          <div className="rounded-md bg-zinc-800/40 px-3 py-2 text-sm text-zinc-200">
            {status.services.find((s) => s.name === 'vLLM')?.loadedModel}
          </div>
        </div>
      )}

      {!status && !error && (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
          Loading GPU status…
        </div>
      )}
    </div>
  );
};
