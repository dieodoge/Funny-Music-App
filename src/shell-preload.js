const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
};

contextBridge.exposeInMainWorld('ytmd', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  home: () => ipcRenderer.send('nav:home'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setColors: (colors) => ipcRenderer.send('settings:set-colors', colors),
  resetColors: () => ipcRenderer.send('settings:reset'),
  setGlass: (on) => ipcRenderer.send('settings:set-glass', on),
  setCase3d: (on) => ipcRenderer.send('settings:set-case3d', on),
  setDrawer: (open) => ipcRenderer.send('drawer:set', open),
  onWindowState: on('win:state'),
  onNavState: on('nav:state'),
  onTheme: on('theme'),
  onPageTitle: on('page:title'),
});
