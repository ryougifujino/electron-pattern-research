import type { DesktopApi } from '../desktop-handlers.ts'
import { createIpcClient } from '../ipc.ts'

export const createDesktopApiClient = () => createIpcClient<DesktopApi>(window.electronAPI.invoke)

export const desktopApi = createDesktopApiClient()
