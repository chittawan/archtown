import { randomUUID } from 'crypto';

/** Express Response / Node ServerResponse — เพียงพอสำหรับ SSE */
export type SseWritable = {
  write(chunk: string): boolean;
  writableEnded?: boolean;
};

export type SseConnection = {
  connId: string;
  res: SseWritable;
  lastEventId: number;
};

const clients = new Map<string, Set<SseConnection>>();
let pingInterval: ReturnType<typeof setInterval> | null = null;

function ensurePingInterval(): void {
  if (pingInterval != null) return;
  pingInterval = setInterval(() => {
    const payload = JSON.stringify({ ts: new Date().toISOString() });
    const chunk = `event: ping\ndata: ${payload}\n\n`;
    for (const set of clients.values()) {
      for (const c of [...set]) {
        if (c.res.writableEnded) {
          set.delete(c);
          continue;
        }
        try {
          c.res.write(chunk);
        } catch {
          set.delete(c);
        }
      }
    }
  }, 30_000);
}

export function formatSseEvent(eventId: number | undefined, eventName: string, data: unknown): string {
  const json = JSON.stringify(data);
  let s = '';
  if (eventId != null && Number.isFinite(eventId)) s += `id: ${eventId}\n`;
  s += `event: ${eventName}\ndata: ${json}\n\n`;
  return s;
}

export function broadcast(userId: string, eventName: string, data: unknown, eventId: number): void {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const chunk = formatSseEvent(eventId, eventName, data);
  for (const c of [...set]) {
    if (c.res.writableEnded) {
      set.delete(c);
      continue;
    }
    try {
      c.res.write(chunk);
    } catch {
      set.delete(c);
    }
  }
}

export function addClient(userId: string, res: SseWritable, lastEventId: number): string {
  const connId = randomUUID();
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add({ connId, res, lastEventId });
  ensurePingInterval();
  return connId;
}

export function removeClient(userId: string, connId: string): void {
  const set = clients.get(userId);
  if (!set) return;
  for (const c of set) {
    if (c.connId === connId) {
      set.delete(c);
      break;
    }
  }
  if (set.size === 0) clients.delete(userId);
}
