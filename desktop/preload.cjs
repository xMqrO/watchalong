// WatchAlong desktop preload: a tiny, explicit bridge for desktop-only
// settings. Exposed as `window.watchalongDesktop` (not `window.electron`,
// which the website's web shim provides and other code relies on).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("watchalongDesktop", {
  hardwareAcceleration: {
    // -> { enabled: saved setting, active: what this session started with }
    get: () => ipcRenderer.invoke("wa:hardware-acceleration:get"),
    set: (enabled) => ipcRenderer.invoke("wa:hardware-acceleration:set", !!enabled),
  },
  relaunch: () => ipcRenderer.invoke("wa:relaunch"),
});
