import type { DesktopProcedures } from '../desktop-procedures.ts'
import type { IpcBridge } from '../ipc.ts'

export {}

declare global {
  interface Window {
    desktopBridge: IpcBridge<DesktopProcedures>
  }
}
