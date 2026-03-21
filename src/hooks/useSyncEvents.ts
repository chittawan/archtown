/**
 * SSE /api/sync/events — รับ patch/upload/version (ใช้ fetch+stream เพราะต้องส่ง X-Google-User-Id / Bearer)
 */
import { useEffect, useRef } from 'react';
import { applyRemotePatchOpsToDb } from '../db/applyRemoteSyncPatch';
import { downloadFromCloud, getLastSyncedAt } from '../db/cloudSync';
import { setStoredSyncMeta } from '../db/syncManager';
import { getGoogleUserId, getTokenLoginToken } from '../lib/googleAuth';

const SYNC_EVENTS_URL = '/api/sync/events';

function sseLastIdStorageKey(userId: string): string {
  return `archtown_sse_last_event_id_${userId}`;
}

function getSyncHeaders(): Record<string, string> {
  const userId = getGoogleUserId();
  const token = getTokenLoginToken();
  const headers: Record<string, string> = { 'X-Google-User-Id': userId ?? 'guest' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function readLastEventId(userId: string): string | undefined {
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const v = sessionStorage.getItem(sseLastIdStorageKey(userId));
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

function writeLastEventId(userId: string, id: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(sseLastIdStorageKey(userId), id);
  } catch {
    /* ignore */
  }
}

function shouldSkipActor(actor: string | undefined): boolean {
  const uid = getGoogleUserId();
  if (!uid || !actor) return false;
  return actor === `human:${uid}`;
}

type SseMessage = { id?: string; event: string; data: string };

function parseSseBlock(block: string): SseMessage | null {
  const lines = block.split('\n');
  let id: string | undefined;
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^\s/, ''));
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { id, event, data: dataLines.join('\n') };
}

function dispatchRemoteRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('capability-refresh'));
  window.dispatchEvent(new CustomEvent('project-summary-invalidate', { detail: {} }));
}

export function useSyncEvents(enabled: boolean): void {
  const abortRef = useRef<AbortController | null>(null);
  const backoffRef = useRef(1000);
  const chainRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof fetch === 'undefined') return;

    const userId = getGoogleUserId();
    if (!userId) return;

    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;

    const runLoop = async () => {
      while (!cancelled && !ac.signal.aborted) {
        try {
          const headers: Record<string, string> = {
            Accept: 'text/event-stream',
            ...getSyncHeaders(),
          };
          const lastId = readLastEventId(userId);
          if (lastId) headers['Last-Event-ID'] = lastId;

          const res = await fetch(SYNC_EVENTS_URL, {
            method: 'GET',
            headers,
            credentials: 'include',
            signal: ac.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(`SSE HTTP ${res.status}`);
          }

          backoffRef.current = 1000;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let carry = '';

          while (!cancelled && !ac.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            carry += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = carry.indexOf('\n\n')) >= 0) {
              const block = carry.slice(0, sep);
              carry = carry.slice(sep + 2);
              const msg = parseSseBlock(block);
              if (!msg) continue;
              if (msg.event === 'ping') continue;

              if (msg.id) writeLastEventId(userId, msg.id);

              if (!msg.data) continue;

              if (msg.event === 'patch') {
                let payload: { version?: number; ops?: unknown[]; actor?: string; ts?: string };
                try {
                  payload = JSON.parse(msg.data) as typeof payload;
                } catch {
                  continue;
                }
                if (shouldSkipActor(payload.actor)) continue;
                const ops = payload.ops;
                const version = payload.version;
                const ts = payload.ts ?? new Date().toISOString();
                if (!Array.isArray(ops) || typeof version !== 'number') continue;

                chainRef.current = chainRef.current.then(async () => {
                  try {
                    await applyRemotePatchOpsToDb(ops);
                    setStoredSyncMeta(version, ts);
                    dispatchRemoteRefresh();
                  } catch (e) {
                    console.warn('[useSyncEvents] patch apply failed', e);
                  }
                });
              } else if (msg.event === 'upload') {
                chainRef.current = chainRef.current.then(async () => {
                  try {
                    const r = await downloadFromCloud();
                    if (r.ok) dispatchRemoteRefresh();
                  } catch (e) {
                    console.warn('[useSyncEvents] upload re-fetch failed', e);
                  }
                });
              } else if (msg.event === 'version') {
                let payload: { version?: number; updated_at?: string };
                try {
                  payload = JSON.parse(msg.data) as typeof payload;
                } catch {
                  continue;
                }
                const remoteV = payload.version;
                if (typeof remoteV !== 'number') continue;
                const local = getLastSyncedAt();
                const localV = local?.version ?? 0;
                if (remoteV > localV) {
                  chainRef.current = chainRef.current.then(async () => {
                    try {
                      const r = await downloadFromCloud();
                      if (r.ok) dispatchRemoteRefresh();
                    } catch (e) {
                      console.warn('[useSyncEvents] version-triggered download failed', e);
                    }
                  });
                }
              }
            }
          }

          if (!cancelled && !ac.signal.aborted) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch (e) {
          if (cancelled || ac.signal.aborted) break;
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    void runLoop();

    return () => {
      cancelled = true;
      ac.abort();
      abortRef.current = null;
    };
  }, [enabled]);
}
