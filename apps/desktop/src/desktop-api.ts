import type { DesktopApi } from '../desktop-handlers.ts'
import { createIpcClient } from '../ipc.ts'

export const desktopApi = createIpcClient<DesktopApi>(window.electronAPI.invoke)
