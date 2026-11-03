import { contextBridge, ipcRenderer } from 'electron';
import type { RushAPI } from './types';
const api: RushAPI = {
  state: () => ipcRenderer.invoke('rush:state'),
  configure: value => ipcRenderer.invoke('rush:configure', value),
  token: () => ipcRenderer.invoke('rush:token'),
  copyToken: () => ipcRenderer.invoke('rush:copy-token'),
  openExtension: () => ipcRenderer.invoke('rush:open-extension'),
  analyze: fen => ipcRenderer.invoke('rush:analyze', fen),
  onState: listener => {
    const handle = (_: unknown, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on('rush:state', handle);
    return () => ipcRenderer.removeListener('rush:state', handle);
  },
};
contextBridge.exposeInMainWorld('rush', api);
