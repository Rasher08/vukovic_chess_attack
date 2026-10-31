const ENDPOINT = 'http://127.0.0.1:18319/moves';
let queue = Promise.resolve();
let activeRequest;
const chessUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && /^(www\.)?chess\.com$/.test(u.hostname); } catch { return false; } };
async function post(config, sample) {
  config.sequence++;
  await chrome.storage.session.set({ connection: config });
  activeRequest?.abort();
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 900);
  activeRequest = abort;
  const requestSequence = config.sequence, requestSession = config.session;
  // Do not queue network waits: a new observation must supersede a slow fetch.
  void (async () => { try {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nonchalant-Extension': chrome.runtime.id },
      credentials: 'omit', cache: 'no-store', signal: abort.signal,
      body: JSON.stringify({ token: config.token, session: config.session, sequence: config.sequence,
        sentAt: Date.now(), startFen: config.startFen, game: sample.game, moves: sample.moves,
        currentPly: sample.currentPly, visible: sample.visible, ready: sample.ready }) });
    if (!response.ok) throw Error('HUD отклонил подключение. Проверьте ключ и версию приложения.');
    const data = await response.json();
    const saved = (await chrome.storage.session.get('connection')).connection;
    if (saved?.session === requestSession && saved.sequence === requestSequence) await chrome.storage.session.set({ status: data });
  } catch (e) {
    const status = { ok: false, detail: e.message === 'HUD отклонил подключение. Проверьте ключ и версию приложения.' ? e.message : 'HUD недоступен. Откройте приложение и выберите «Ходы Chess.com».' };
    const saved = (await chrome.storage.session.get('connection')).connection;
    if (saved?.session === requestSession && saved.sequence === requestSequence) await chrome.storage.session.set({ status });
  } finally { clearTimeout(timer); } })();
  return { ok: true, detail: 'Подключаем список ходов…' };
}
async function handle(message, sender) {
  const stored = await chrome.storage.session.get(['connection', 'status']);
  const config = stored.connection;
  const popup = sender.id === chrome.runtime.id && !sender.tab && sender.url === chrome.runtime.getURL('popup.html');
  if (popup && message?.kind === 'status') return stored.status || { ok: false, detail: 'Откройте вкладку партии и подключитесь.' };
  if (popup && message?.kind === 'connect') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !chessUrl(tab.url)) return { ok: false, detail: 'Сначала откройте вкладку Chess.com.' };
    const token = String(message.token || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, detail: 'Скопируйте полный ключ из HUD.' };
    if (typeof message.startFen !== 'string' || message.startFen.length > 200) return { ok: false, detail: 'Проверьте начальную позицию.' };
    if (config) await post(config, { game: config.game, moves: [], currentPly: null, visible: false, ready: false });
    const next = { tabId: tab.id, token, session: crypto.randomUUID(), sequence: 0, startFen: message.startFen, game: new URL(tab.url).origin + new URL(tab.url).pathname };
    await chrome.storage.session.set({ connection: next, status: { ok: true, detail: 'Подключаем список ходов…' } });
    try { await chrome.tabs.sendMessage(tab.id, { kind: 'start' }); }
    catch { return { ok: false, detail: 'Обновите страницу Chess.com, затем подключитесь снова.' }; }
    return { ok: true, detail: 'Подключено. Ожидаем список ходов.' };
  }
  if (popup && message?.kind === 'disconnect') {
    if (config) {
      await post(config, { game: config.game, moves: [], currentPly: null, visible: false, ready: false });
      await chrome.tabs.sendMessage(config.tabId, { kind: 'stop' }).catch(() => {});
    }
    await chrome.storage.session.remove('connection');
    await chrome.storage.session.set({ status: { ok: false, detail: 'Отключено.' } });
    return { ok: true, detail: 'Отключено.' };
  }
  if (!sender.tab || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !chessUrl(sender.url) || config?.tabId !== sender.tab.id) return { enabled: false };
  if (message?.kind === 'hello') return { enabled: true };
  if (message?.kind !== 'moves' || !Array.isArray(message.moves) || message.moves.length > 2400) return { ok: false };
  if (!Number.isFinite(message.observedAt) || Math.abs(Date.now() - message.observedAt) > 1000) return { ok: false };
  const u = new URL(sender.url), game = u.origin + u.pathname;
  if (message.game !== game) return { ok: false };
  config.game = game;
  return post(config, { ...message, visible: message.visible === true && sender.tab.active === true });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  queue = queue.then(() => handle(message, sender)).then(reply, () => reply({ ok: false, detail: 'Не удалось подключиться. Перезапустите расширение.' }));
  return true;
});
