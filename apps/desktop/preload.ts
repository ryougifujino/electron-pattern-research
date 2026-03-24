import { contextBridge, ipcRenderer } from 'electron'
import { type DesktopApi } from './desktop-handlers.ts'
import { createElectronAPI, DESKTOP_IPC_CHANNEL } from './ipc.ts'

contextBridge.exposeInMainWorld('electronAPI', createElectronAPI<DesktopApi>(ipcRenderer, DESKTOP_IPC_CHANNEL))
