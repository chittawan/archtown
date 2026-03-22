import { Router } from 'express';
import type express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractMcpToken } from '../mcp/mcpAuth';
import { createArchtownMcpServer } from '../mcp/mcpServer';
import { getSyncUserIdFromIncoming } from '../services/syncUser';

export function createMcpRouter(): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, name: 'archtown-mcp', version: '1.0.0' });
  });

  const handleMcpPost = async (req: express.Request, res: express.Response) => {
    const userId = getSyncUserIdFromIncoming({ headers: req.headers, query: req.query, url: req.url });
    const token = extractMcpToken(req);
    const authHeader = token ? `Bearer ${token}` : null;
    const baseUrl =
      (process.env.ARCHTOWN_BASE_URL && process.env.ARCHTOWN_BASE_URL.replace(/\/$/, '')) ||
      `http://127.0.0.1:${Number(process.env.PORT) || 3000}`;

    const mcp = createArchtownMcpServer({ baseUrl, userId, authHeader });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: e instanceof Error ? e.message : String(e),
          },
          id: null,
        });
      }
    } finally {
      await mcp.close().catch(() => {});
      await transport.close().catch(() => {});
    }
  };

  r.post('/', handleMcpPost);
  /** e.g. POST https://host/mcp/atkn_xxx?userId=... when headers are not available */
  r.post('/:mcpToken', handleMcpPost);

  return r;
}
