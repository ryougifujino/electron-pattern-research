import type { DesktopProcedures } from '../desktop-procedures.ts'
import { createIpcProcedureClient } from '../ipc.ts'

export const createDesktopClient = () => createIpcProcedureClient<DesktopProcedures>(window.desktopBridge.invoke)

export const desktopClient = createDesktopClient()
