import { contextBridge, ipcRenderer } from 'electron';
import type { HudAPI } from './types';
const api: HudAPI = {
  getState: () => ipcRenderer.invoke('hud:state'),
  getToken: () => ipcRenderer.invoke('hud:token'),
  sources: () => ipcRenderer.invoke('hud:sources'),
  selectSource: id => ipcRenderer.invoke('hud:select-source', id),
  screenPosition: fen => ipcRenderer.send('hud:screen-position', fen),
  configure: settings => ipcRenderer.invoke('hud:configure', settings),
  openSettings: () => ipcRenderer.send('hud:settings'),
  copyToken: () => ipcRenderer.invoke('hud:copy-token'),
  onState: listener => { const fn = (_: unknown, state: Parameters<typeof listener>[0]) => listener(state); ipcRenderer.on('hud:state', fn); return () => ipcRenderer.removeListener('hud:state', fn); },
  onSound: listener => { const fn = () => listener(); ipcRenderer.on('hud:sound', fn); return () => ipcRenderer.removeListener('hud:sound', fn); },
  onNewGame: listener => { const fn = () => listener(); ipcRenderer.on('hud:new-game', fn); return () => ipcRenderer.removeListener('hud:new-game', fn); },
};
contextBridge.exposeInMainWorld('hud', api);
