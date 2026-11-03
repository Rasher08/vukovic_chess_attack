const ENDPOINT = 'http://127.0.0.1:18329/analyze';
const puzzleUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && /^(www\.)?chess\.com$/.test(u.hostname) && /^\/puzzles(?:\/|$)/.test(u.pathname); } catch { return false; } };
let queue = Promise.resolve(), activeRequest;
async function post(config, sample) {
  config.sequence++;
  await chrome.storage.session.set({ connection: config });
  activeRequest?.abort();
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 4000);
  activeRequest = abort;
  const sequence = config.sequence, session = config.session;
  // The transport queue covers configuration only. A slow search must never
  // postpone a changed position or a withdrawal.
  void (async () => {
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nonchalant-Extension': chrome.runtime.id },
        credentials: 'omit', cache: 'no-store', signal: abort.signal,
        body: JSON.stringify({ token: config.token, session, sequence, fen: sample.fen, positionId: sample.positionId, visible: sample.visible, sentAt: Date.now() }) });
      if (!response.ok) throw Error(response.status === 403 ? 'Ключ не принят. Скопируйте новый ключ из приложения.' : 'Приложение отклонило позицию.');
      const result = await response.json();
      const saved = (await chrome.storage.session.get('connection')).connection;
      if (saved?.session !== session || saved.sequence !== sequence) return;
      if (result.positionId !== sample.positionId || result.sequence !== sequence || result.ok !== true) throw Error('Приложение вернуло другой запрос.');
      await chrome.storage.session.set({ status: { ok: true, detail: result.detail || (sample.visible ? `Стрелка готова · ${Math.round(result.elapsedMs || 0)} мс · глубина ${result.depth || 0}` : 'Ожидаем позицию…') } });
      await chrome.tabs.sendMessage(config.tabId, { kind: 'result', ok: true, positionId: result.positionId, sequence: result.sequence,
        move: result.move, depth: result.depth, elapsedMs: result.elapsedMs, final: result.final === true }).catch(() => {});
    } catch (error) {
      const saved = (await chrome.storage.session.get('connection')).connection;
      if (saved?.session !== session || saved.sequence !== sequence) return;
      const detail = abort.signal.aborted ? 'Нет ответа от приложения. Откройте Rush HUD.' : error.message || 'Нет связи с приложением.';
      await chrome.storage.session.set({ status: { ok: false, detail } });
      await chrome.tabs.sendMessage(config.tabId, { kind: 'result', ok: false, positionId: sample.positionId, sequence }).catch(() => {});
    } finally { clearTimeout(timer); }
  })();
  return { ok: true, pending: true };
}
async function handle(message, sender) {
  const stored = await chrome.storage.session.get(['connection', 'status']), config = stored.connection;
  const popup = sender.id === chrome.runtime.id && !sender.tab && sender.url === chrome.runtime.getURL('popup.html');
  if (popup && message?.kind === 'status') return stored.status || { ok: false, detail: 'Откройте задачи Chess.com и подключитесь.' };
  if (popup && message?.kind === 'connect') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !puzzleUrl(tab.url)) return { ok: false, detail: 'Сначала откройте Chess.com → Задачи → Штурм.' };
    const token = String(message.token || '').trim().toLowerCase(), side = message.side || 'auto';
    if (!/^[a-f0-9]{64}$/.test(token) || !['auto', 'white', 'black'].includes(side)) return { ok: false, detail: 'Скопируйте полный ключ из Rush HUD.' };
    if (config) { await post(config, { fen: null, positionId: 'disconnect', visible: false }); await chrome.tabs.sendMessage(config.tabId, { kind: 'stop' }).catch(() => {}); }
    const next = { tabId: tab.id, token, side, session: crypto.randomUUID(), sequence: 0 };
    await chrome.storage.session.set({ connection: next, status: { ok: true, detail: 'Подключено. Ожидаем доску…' } });
    try { await chrome.tabs.sendMessage(tab.id, { kind: 'start', side }); }
    catch { await chrome.storage.session.remove('connection'); return { ok: false, detail: 'Обновите страницу Chess.com и подключитесь снова.' }; }
    return { ok: true, detail: 'Подключено. Ожидаем доску…' };
  }
  if (popup && message?.kind === 'disconnect') {
    if (config) { await post(config, { fen: null, positionId: 'disconnect', visible: false }); await chrome.tabs.sendMessage(config.tabId, { kind: 'stop' }).catch(() => {}); }
    await chrome.storage.session.remove('connection');
    await chrome.storage.session.set({ status: { ok: false, detail: 'Отключено.' } });
    return { ok: true, detail: 'Отключено.' };
  }
  if (!sender.tab || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !puzzleUrl(sender.url) || config?.tabId !== sender.tab.id) return { enabled: false, ok: false };
  if (message?.kind === 'hello') return { enabled: true, side: config.side };
  if (message?.kind !== 'position' || !(message.fen === null || typeof message.fen === 'string' && message.fen.length <= 200) || typeof message.positionId !== 'string' || message.positionId.length > 240 || !Number.isFinite(message.observedAt) || Math.abs(Date.now() - message.observedAt) > 1000) return { ok: false };
  return post(config, { ...message, visible: message.visible === true && sender.tab.active === true });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  queue = queue.then(() => handle(message, sender)).then(reply, () => reply({ ok: false, detail: 'Ошибка расширения. Подключитесь снова.' }));
  return true;
});
