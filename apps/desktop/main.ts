import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { createDesktopProcedures } from './desktop-procedures.ts'
import { DESKTOP_RPC_CHANNEL, registerIpcProcedures } from './ipc.ts'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const rendererIndexPath = path.join(currentDir, '..', 'renderer', 'index.html')
const preloadPath = path.join(currentDir, 'preload.cjs')

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const desktopProcedures = createDesktopProcedures()

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: preloadPath,
    },
  })

  if (devServerUrl !== undefined) {
    void win.loadURL(devServerUrl)
    return
  }

  void win.loadFile(rendererIndexPath)
}

app.whenReady().then(() => {
  registerIpcProcedures(ipcMain, DESKTOP_RPC_CHANNEL, desktopProcedures)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
