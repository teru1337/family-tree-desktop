const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("familyTreeDesktop", {
  close: () => ipcRenderer.send("family-tree-close"),
});
