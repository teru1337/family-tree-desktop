const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("familyTreeDesktop", {
  close: () => ipcRenderer.send("family-tree-close"),
  getVersion: () => ipcRenderer.invoke("family-tree-version"),
  getRuntimeStatus: () => ipcRenderer.invoke("family-tree-runtime-status"),
  checkForUpdates: () => ipcRenderer.invoke("family-tree-update-check"),
  openProjectFile: () => ipcRenderer.invoke("family-tree-open-project-file"),
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
