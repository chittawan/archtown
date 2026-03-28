import type { ArchtownMcpContext } from './types';

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function syncHeaders(ctx: ArchtownMcpContext): Record<string, string> {
  const h: Record<string, string> = {
    'X-Google-User-Id': ctx.userId,
  };
  if (ctx.authHeader) {
    h.Authorization = ctx.authHeader;
  }
  return h;
}

export async function fetchDownloadJson(ctx: ArchtownMcpContext): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  const url = `${trimBase(ctx.baseUrl)}/api/sync/download`;
  const res = await fetch(url, { headers: syncHeaders(ctx) });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, text };
  }
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 500, text: 'invalid JSON from download' };
  }
}

export async function fetchPatch(
  ctx: ArchtownMcpContext,
  body: { base_version: number; ops: unknown[] },
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  const url = `${trimBase(ctx.baseUrl)}/api/sync/patch`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...syncHeaders(ctx),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text) as unknown;
    if (!res.ok) {
      return { ok: false, status: res.status, text: typeof data === 'object' && data ? JSON.stringify(data) : text };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: res.status, text };
  }
}

export async function fetchUndo(
  ctx: ArchtownMcpContext,
  reqId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  const url = `${trimBase(ctx.baseUrl)}/api/audit/undo/${encodeURIComponent(reqId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: syncHeaders(ctx),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text) as unknown;
    if (!res.ok) {
      return { ok: false, status: res.status, text: typeof data === 'object' && data ? JSON.stringify(data) : text };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: res.status, text };
  }
}

export async function fetchEaJson(
  ctx: ArchtownMcpContext,
  method: 'GET' | 'PUT' | 'POST',
  pathname: string,
  body?: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  const pathPart = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = `${trimBase(ctx.baseUrl)}${pathPart}`;
  const headers: Record<string, string> = { ...syncHeaders(ctx) };
  const init: RequestInit = { method, headers };
  if (body !== undefined && (method === 'PUT' || method === 'POST')) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    const data = JSON.parse(text) as unknown;
    if (!res.ok) {
      return { ok: false, status: res.status, text: typeof data === 'object' && data ? JSON.stringify(data) : text };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: res.status, text };
  }
}
