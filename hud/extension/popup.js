const $ = id => document.getElementById(id);
const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
$('start').onchange = () => { $('fen').hidden = $('start').value !== 'custom'; };
const status = value => { $('status').textContent = value?.detail || 'Нет связи с HUD.'; };
$('connect').onclick = async () => {
  $('connect').disabled = true;
  try { status(await chrome.runtime.sendMessage({ kind: 'connect', token: $('token').value, startFen: $('start').value === 'standard' ? initialFen : $('fen').value.trim() })); }
  finally { $('connect').disabled = false; }
};
$('disconnect').onclick = async () => status(await chrome.runtime.sendMessage({ kind: 'disconnect' }));
const refresh = async () => status(await chrome.runtime.sendMessage({ kind: 'status' }));
void refresh(); setInterval(() => { void refresh(); }, 600);
void chrome.storage.session.get('connection').then(({ connection }) => {
  if (connection) { $('token').value = connection.token; if (connection.startFen !== initialFen) { $('start').value = 'custom'; $('fen').value = connection.startFen; $('fen').hidden = false; } }
});
