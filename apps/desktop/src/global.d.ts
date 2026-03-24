import type { DesktopApi } from '../desktop-handlers.ts'
import type { ElectronAPI } from '../ipc.ts'

export {}

declare global {
  interface Window {
    electronAPI: ElectronAPI<DesktopApi>
  }
}
