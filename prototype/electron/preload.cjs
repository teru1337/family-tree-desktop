const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("familyTreeDesktop", {
  close: () => ipcRenderer.send("family-tree-close"),
  getVersion: () => ipcRenderer.invoke("family-tree-version"),
  checkForUpdates: () => ipcRenderer.invoke("family-tree-update-check"),
  saveProjectFile: (payload, suggestedName, filePath = "", kind = "project") => ipcRenderer.invoke("family-tree-save-project-file", { payload, suggestedName, filePath, kind }),
  downloadUpdate: () => ipcRenderer.invoke("family-tree-update-download"),
  installUpdate: () => ipcRenderer.invoke("family-tree-update-install"),
  openReleases: () => ipcRenderer.invoke("family-tree-open-releases"),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("family-tree-update-status", handler);
    return () => ipcRenderer.removeListener("family-tree-update-status", handler);
  },
});
