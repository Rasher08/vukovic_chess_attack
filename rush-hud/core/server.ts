import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { RushController } from './controller';

/** Loopback only. A paired extension owns one short-lived, sequenced lease. */
export function createRushServer(controller: RushController, token: string, onConnection: (connected: boolean) => void) {
  let activeSession = '', activeExtension = '', sequence = 0, seen = 0, connected = false;
  const retired = new Set<string>();
  function connection(value: boolean) { if (connected !== value) { connected = value; onConnection(value); } }
  function secret(value: unknown) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  }
  function json(res: ServerResponse, code: number, body: unknown) { if (!res.destroyed) res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); }
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin || '';
    const header = req.headers['x-nonchalant-extension'];
    const id = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin)?.[1] || (!origin && typeof header === 'string' && /^[a-p]{32}$/.test(header) ? header : '');
    if (req.url !== '/analyze' || !id || origin && header && header !== id) { res.writeHead(403).end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nonchalant-Extension');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end(); return; }
    let body = '', oversize = false;
    req.setTimeout(3000, () => req.destroy());
    req.on('data', chunk => { body += chunk; if (body.length > 2048) { oversize = true; res.writeHead(413).end(); req.destroy(); } });
    req.on('end', () => {
      if (oversize) return;
      void (async () => {
        let value;
        try { value = JSON.parse(body); } catch { json(res, 400, { ok: false, detail: 'Неверный JSON.' }); return; }
        if (!value || !secret(value.token)) { json(res, 401, { ok: false, detail: 'Неверный ключ. Скопируйте ключ из приложения.' }); return; }
        const valid = typeof value.session === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value.session) &&
          Number.isSafeInteger(value.sequence) && value.sequence > 0 && typeof value.positionId === 'string' && value.positionId.length <= 160 &&
          typeof value.visible === 'boolean' && (value.fen === null || typeof value.fen === 'string' && value.fen.length <= 200) &&
          typeof value.sentAt === 'number' && Number.isFinite(value.sentAt) && Math.abs(Date.now() - value.sentAt) <= 1500;
        if (!valid) { json(res, 400, { ok: false, detail: 'Неверное сообщение.' }); return; }
        if (retired.has(value.session)) { json(res, 409, { ok: false, detail: 'Это подключение уже закрыто.' }); return; }
        if (activeSession !== value.session || activeExtension !== id) {
          if (activeSession) retired.add(activeSession);
          if (retired.size > 256) retired.delete(retired.values().next().value!);
          activeSession = value.session; activeExtension = id; sequence = 0; controller.invalidate();
        }
        if (value.sequence <= sequence) { json(res, 409, { ok: false, detail: 'Позиция уже сменилась.' }); return; }
        sequence = value.sequence; seen = Date.now(); connection(value.visible);
        const requestSession = activeSession, requestSequence = sequence;
        const answer = { positionId: value.positionId, sequence: requestSequence };
        if (!value.visible || !value.fen) {
          controller.invalidate(); json(res, 200, { ok: true, ...answer, move: null, depth: 0, elapsedMs: 0, final: true }); return;
        }
        try {
          const result = await controller.analyze(value.fen);
          if (requestSession !== activeSession || requestSequence !== sequence || Date.now() - seen > 2000) {
            json(res, 409, { ok: false, ...answer, move: null, detail: 'Позиция уже сменилась.' }); return;
          }
          json(res, 200, { ok: true, ...answer, ...result, pv: undefined });
        } catch (error) { json(res, 422, { ok: false, ...answer, move: null, detail: error instanceof Error ? error.message : 'Ошибка проверки.' }); }
      })().catch(() => json(res, 500, { ok: false, detail: 'Ошибка подключения.' }));
    });
  });
  const lease = setInterval(() => {
    if (connected && Date.now() - seen > 2000) { connection(false); controller.invalidate(); }
  }, 250);
  lease.unref();
  server.on('close', () => { clearInterval(lease); connection(false); controller.invalidate(); });
  return server;
}
