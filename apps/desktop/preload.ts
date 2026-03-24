import { contextBridge, ipcRenderer } from 'electron'
import { type DesktopProcedures } from './desktop-procedures.ts'
import { createIpcBridge, DESKTOP_RPC_CHANNEL } from './ipc.ts'

contextBridge.exposeInMainWorld('desktopBridge', createIpcBridge<DesktopProcedures>(ipcRenderer, DESKTOP_RPC_CHANNEL))
