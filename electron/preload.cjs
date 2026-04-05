const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (command, args) => ipcRenderer.invoke("romm-invoke", { command, args }),
  isElectron: true,
});
