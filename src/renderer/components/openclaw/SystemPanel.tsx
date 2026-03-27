import { useEffect, useState } from 'react';

interface CpuInfo {
  usagePct: number;
  loadAvg: [number, number, number];
  coreCount: number;
}

interface MemoryInfo {
  totalMiB: number;
  usedMiB: number;
  freeMiB: number;
  buffersCacheMiB: number;
}

interface DiskInfo {
  device: string;
  mountpoint: string;
  totalGiB: number;
  usedGiB: number;
  freeGiB: number;
  usePct: number;
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpuPct: number;
  memPct: number;
  memRss: number;
  user: string;
  command: string;
}

interface SystemStatus {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo[];
  processes: ProcessInfo[];
  fetchedAt: number;
}

function fmtMiB(mib: number): string {
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GB`;
  return `${mib} MB`;
}

function fmtGiB(gib: number): string {
  if (gib >= 1024) return `${(gib / 1024).toFixed(1)} TB`;
  return `${gib} GB`;
}

function fmtRssKB(kb: number): string {
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
}

const BarMeter = ({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
}): React.JSX.Element => {
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
};

function cpuColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 60) return 'bg-yellow-500';
  return 'bg-blue-500';
}

function memColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 75) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function diskColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 75) return 'bg-yellow-500';
  return 'bg-purple-500';
}

export const SystemPanel = (): React.JSX.Element => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const fetchStatus = (): void => {
    fetch('/api/system/status')
      .then((r) => r.json() as Promise<SystemStatus>)
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

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          System Monitor
        </h2>
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

      {/* CPU */}
      {status && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">CPU</span>
            <span className="text-[11px] text-zinc-500">{status.cpu.coreCount} cores</span>
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="text-zinc-500">Usage</span>
                <span className="text-zinc-400">{status.cpu.usagePct.toFixed(1)}%</span>
              </div>
              <BarMeter
                value={status.cpu.usagePct}
                max={100}
                color={cpuColor(status.cpu.usagePct)}
              />
            </div>
            <div className="flex items-center gap-4 pt-1 text-[11px]">
              <span className="text-zinc-500">Load avg:</span>
              <span className="text-zinc-400">{status.cpu.loadAvg[0].toFixed(2)}</span>
              <span className="text-zinc-500">{status.cpu.loadAvg[1].toFixed(2)}</span>
              <span className="text-zinc-600">{status.cpu.loadAvg[2].toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Memory */}
      {status && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200">Memory</span>
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="text-zinc-500">Used</span>
                <span className="text-zinc-400">
                  {fmtMiB(status.memory.usedMiB)} / {fmtMiB(status.memory.totalMiB)}
                  <span className="ml-1 text-zinc-600">({fmtMiB(status.memory.freeMiB)} free)</span>
                </span>
              </div>
              <BarMeter
                value={status.memory.usedMiB}
                max={status.memory.totalMiB}
                color={memColor(
                  status.memory.totalMiB > 0
                    ? (status.memory.usedMiB / status.memory.totalMiB) * 100
                    : 0
                )}
              />
            </div>
            <div className="flex items-center gap-2 pt-0.5 text-[11px]">
              <span className="text-zinc-500">Buffers/Cache:</span>
              <span className="text-zinc-400">{fmtMiB(status.memory.buffersCacheMiB)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disk */}
      {status && status.disk.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">Disk</div>
          <div className="space-y-2">
            {status.disk.map((d) => (
              <div
                key={`${d.device}-${d.mountpoint}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-zinc-200">{d.mountpoint}</span>
                  <span className="ml-2 shrink-0 text-[11px] text-zinc-500">{d.device}</span>
                </div>
                <div className="mb-0.5 flex justify-between text-[11px]">
                  <span className="text-zinc-500">
                    {fmtGiB(d.usedGiB)} / {fmtGiB(d.totalGiB)}
                  </span>
                  <span className="text-zinc-400">{fmtGiB(d.freeGiB)} free</span>
                </div>
                <BarMeter value={d.usePct} max={100} color={diskColor(d.usePct)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Processes */}
      {status && status.processes.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">
            Top Processes ({status.processes.length})
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-2 py-1.5 text-left font-medium text-zinc-500">PID</th>
                  <th className="px-2 py-1.5 text-left font-medium text-zinc-500">User</th>
                  <th className="px-2 py-1.5 text-left font-medium text-zinc-500">Name</th>
                  <th className="px-2 py-1.5 text-right font-medium text-zinc-500">CPU%</th>
                  <th className="px-2 py-1.5 text-right font-medium text-zinc-500">MEM%</th>
                  <th className="px-2 py-1.5 text-right font-medium text-zinc-500">RSS</th>
                </tr>
              </thead>
              <tbody>
                {status.processes.map((proc) => (
                  <tr
                    key={proc.pid}
                    className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30"
                    title={proc.command}
                  >
                    <td className="px-2 py-1 text-zinc-500">{proc.pid}</td>
                    <td className="px-2 py-1 text-zinc-500">{proc.user}</td>
                    <td className="max-w-[180px] truncate px-2 py-1 text-zinc-300">{proc.name}</td>
                    <td
                      className={`px-2 py-1 text-right ${proc.cpuPct > 50 ? 'text-yellow-400' : proc.cpuPct > 80 ? 'text-red-400' : 'text-zinc-400'}`}
                    >
                      {proc.cpuPct.toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right text-zinc-400">{proc.memPct.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right text-zinc-500">{fmtRssKB(proc.memRss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!status && !error && (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
          Loading system status…
        </div>
      )}
    </div>
  );
};
