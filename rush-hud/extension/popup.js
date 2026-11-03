const $ = id => document.getElementById(id);
const status = value => { $('status').textContent = value?.detail || 'Нет связи с приложением.'; };
$('connect').onclick = async () => {
  $('connect').disabled = true;
  try { status(await chrome.runtime.sendMessage({ kind: 'connect', token: $('token').value, side: $('side').value })); }
  finally { $('connect').disabled = false; }
};
$('disconnect').onclick = async () => status(await chrome.runtime.sendMessage({ kind: 'disconnect' }));
const refresh = async () => status(await chrome.runtime.sendMessage({ kind: 'status' }));
void refresh(); setInterval(() => { void refresh(); }, 700);
void chrome.storage.session.get('connection').then(({ connection }) => { if (connection) { $('token').value = connection.token; $('side').value = connection.side || 'auto'; } });
