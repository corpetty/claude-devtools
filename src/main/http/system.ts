/**
 * System monitoring routes.
 *
 * Routes:
 * - GET /api/system/status - CPU, memory, disk, and top processes
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createLogger } from '@shared/utils/logger';

import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:system');

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

function readProcStat(): number[] {
  const line = readFileSync('/proc/stat', 'utf-8').split('\n')[0] ?? '';
  // cpu  user nice system idle iowait irq softirq steal guest guest_nice
  return line.replace(/^cpu\s+/, '').split(/\s+/).map(Number);
}

function parseCpuUsage(): Pick<CpuInfo, 'usagePct' | 'coreCount'> {
  try {
    // Two-sample delta from /proc/stat for accurate CPU %
    const s1 = readProcStat();
    const t1 = Date.now();
    // Busy-wait 200ms synchronously (lightweight, acceptable for a status endpoint)
    execSync('sleep 0.2', { timeout: 1000 });
    const s2 = readProcStat();

    const total1 = s1.reduce((a, b) => a + b, 0);
    const total2 = s2.reduce((a, b) => a + b, 0);
    const idle1 = s1[3] ?? 0;  // idle
    const idle2 = s2[3] ?? 0;

    const totalDelta = total2 - total1;
    const idleDelta = idle2 - idle1;
    const usagePct = totalDelta > 0 ? Math.round(((totalDelta - idleDelta) / totalDelta) * 1000) / 10 : 0;

    const cpuinfo = readFileSync('/proc/cpuinfo', 'utf-8');
    const coreCount = (cpuinfo.match(/^processor\s/gm) ?? []).length || 1;

    return { usagePct, coreCount };
  } catch (err) {
    logger.error('CPU parse failed:', err);
    return { usagePct: 0, coreCount: 1 };
  }
}

function parseLoadAvg(): [number, number, number] {
  try {
    const raw = readFileSync('/proc/loadavg', 'utf-8').trim();
    const parts = raw.split(/\s+/);
    return [parseFloat(parts[0] ?? '0'), parseFloat(parts[1] ?? '0'), parseFloat(parts[2] ?? '0')];
  } catch {
    return [0, 0, 0];
  }
}

function parseMemory(): MemoryInfo {
  try {
    const raw = readFileSync('/proc/meminfo', 'utf-8');
    const get = (key: string): number => {
      const match = new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(raw);
      return match ? parseInt(match[1], 10) : 0;
    };

    const totalKB = get('MemTotal');
    const freeKB = get('MemFree');
    const buffersKB = get('Buffers');
    const cachedKB = get('Cached');
    const sReclaimableKB = get('SReclaimable');

    const buffersCacheKB = buffersKB + cachedKB + sReclaimableKB;
    const usedKB = totalKB - freeKB - buffersCacheKB;

    return {
      totalMiB: Math.round(totalKB / 1024),
      usedMiB: Math.round(usedKB / 1024),
      freeMiB: Math.round(freeKB / 1024),
      buffersCacheMiB: Math.round(buffersCacheKB / 1024),
    };
  } catch (err) {
    logger.error('Memory parse failed:', err);
    return { totalMiB: 0, usedMiB: 0, freeMiB: 0, buffersCacheMiB: 0 };
  }
}

function parseDisk(): DiskInfo[] {
  try {
    const out = execSync('df -BG --output=source,target,size,used,avail,pcent', {
      timeout: 5000,
    }).toString();

    const lines = out.trim().split('\n').slice(1); // skip header
    const skipFs = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'shm', 'udev']);

    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) return null;

        const device = parts[0];
        const mountpoint = parts[1];
        const totalGiB = parseInt(parts[2], 10);
        const usedGiB = parseInt(parts[3], 10);
        const freeGiB = parseInt(parts[4], 10);
        const usePct = parseInt(parts[5], 10);

        // Filter out virtual filesystems
        const fsType = device.split('/').pop() ?? device;
        if (skipFs.has(fsType) || skipFs.has(device)) return null;
        if (totalGiB < 1) return null;

        return { device, mountpoint, totalGiB, usedGiB, freeGiB, usePct };
      })
      .filter((d): d is DiskInfo => d !== null);
  } catch (err) {
    logger.error('Disk parse failed:', err);
    return [];
  }
}

function getUsername(uid: number): string {
  try {
    const passwd = readFileSync('/etc/passwd', 'utf-8');
    for (const line of passwd.split('\n')) {
      const parts = line.split(':');
      if (parseInt(parts[2] ?? '-1', 10) === uid) return parts[0] ?? String(uid);
    }
  } catch { /* ignore */ }
  return String(uid);
}

function parseProcesses(): ProcessInfo[] {
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const memTotal = (() => {
      const raw = readFileSync('/proc/meminfo', 'utf-8');
      const m = /^MemTotal:\s+(\d+)/m.exec(raw);
      return m ? parseInt(m[1], 10) : 1;
    })();

    const pids = readdirSync('/proc').filter((d: string) => /^\d+$/.test(d));
    const procs: ProcessInfo[] = [];

    for (const pidStr of pids) {
      try {
        const stat = readFileSync(`/proc/${pidStr}/stat`, 'utf-8').trim();
        // Fields: pid (comm) state ppid pgroup session ... utime stime ... rss
        const m = /^(\d+)\s+\((.+?)\)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)\s+(\d+)/.exec(stat);
        if (!m) continue;

        const pid = parseInt(m[1], 10);
        const name = m[2] ?? '';
        const utime = parseInt(m[3], 10);
        const stime = parseInt(m[4], 10);

        // RSS from /proc/pid/statm (in pages)
        const statm = readFileSync(`/proc/${pidStr}/statm`, 'utf-8').trim().split(' ');
        const rssPages = parseInt(statm[1] ?? '0', 10);
        const rssKB = rssPages * 4; // 4KB pages

        // UID from /proc/pid/status
        const status = readFileSync(`/proc/${pidStr}/status`, 'utf-8');
        const uidMatch = /^Uid:\s+(\d+)/m.exec(status);
        const uid = uidMatch ? parseInt(uidMatch[1], 10) : 0;

        // cmdline
        let cmdline = '';
        try {
          cmdline = readFileSync(`/proc/${pidStr}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim().slice(0, 80);
        } catch { cmdline = name; }

        const memPct = memTotal > 0 ? Math.round((rssKB / memTotal) * 1000) / 10 : 0;

        procs.push({
          pid,
          name,
          cpuPct: utime + stime, // raw ticks — we'll normalize below
          memPct,
          memRss: rssKB,
          user: getUsername(uid),
          command: cmdline || name,
        });
      } catch { /* process may have exited */ }
    }

    // Normalize cpuPct: sort by ticks descending, take top 15, then label as relative %
    // (We don't have a delta here so we show cumulative ticks as a sort key,
    //  and display actual % from a second /proc/stat snapshot)
    procs.sort((a, b) => b.cpuPct - a.cpuPct);
    const top15 = procs.slice(0, 15);

    // Get actual per-process CPU% via /proc/pid/stat delta would need state —
    // instead read uptime and compute lifetime CPU% as approximation
    const uptime = parseFloat(readFileSync('/proc/uptime', 'utf-8').split(' ')[0] ?? '1');
    const hz = 100; // USER_HZ
    for (const p of top15) {
      p.cpuPct = Math.round((p.cpuPct / (uptime * hz)) * 1000) / 10;
    }

    return top15;
  } catch (err) {
    logger.error('Process parse failed:', err);
    return [];
  }
}

export function registerSystemRoutes(app: FastifyInstance): void {
  app.get('/api/system/status', async (): Promise<SystemStatus> => {
    const cpuBasic = parseCpuUsage();
    const loadAvg = parseLoadAvg();

    return {
      cpu: {
        usagePct: cpuBasic.usagePct,
        loadAvg,
        coreCount: cpuBasic.coreCount,
      },
      memory: parseMemory(),
      disk: parseDisk(),
      processes: parseProcesses(),
      fetchedAt: Date.now(),
    };
  });
}
