import type { IpcMain, IpcRenderer } from 'electron'

type AsyncMethod = (...args: never[]) => Promise<unknown>
type StringKeyOf<T> = Extract<keyof T, string>
type MethodArgs<T> = T extends (...args: infer Args extends unknown[]) => Promise<unknown> ? Args : never
type MethodResult<T> = T extends (...args: infer _Args extends unknown[]) => Promise<infer Result> ? Result : never

export type IpcHandlers<T extends object> = {
  [K in keyof T]: T[K] extends AsyncMethod ? T[K] : never
}

type InvokeBridge<T extends IpcHandlers<T>> = <K extends StringKeyOf<T>>(
  method: K,
  ...args: MethodArgs<T[K]>
) => Promise<MethodResult<T[K]>>

export type ElectronAPI<T extends IpcHandlers<T>> = {
  invoke: InvokeBridge<T>
}

export const DESKTOP_IPC_CHANNEL = 'app:invoke' as const

export const defineIpcHandlers = <T extends IpcHandlers<T>>(handlers: T): T => handlers

export const createElectronAPI = <T extends IpcHandlers<T>>(
  ipcRenderer: Pick<IpcRenderer, 'invoke'>,
  channel: string,
): ElectronAPI<T> => ({
  invoke: (method, ...args) => ipcRenderer.invoke(channel, method, ...(args as unknown[])),
})

export const createIpcClient = <T extends IpcHandlers<T>>(invoke: InvokeBridge<T>): T => {
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then') {
        return undefined
      }

      return ((...args: MethodArgs<T[StringKeyOf<T>]>) =>
        invoke(property as StringKeyOf<T>, ...args)) as T[StringKeyOf<T>]
    },
  })
}

export const registerIpcHandlers = <T extends IpcHandlers<T>>(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  handlers: T,
) => {
  ipcMain.handle(channel, (_event, method: string, ...args: unknown[]) => {
    if (!Object.hasOwn(handlers, method)) {
      throw new Error(`Unknown IPC method: ${method}`)
    }

    const handler = handlers[method as StringKeyOf<T>] as unknown as (...invokeArgs: unknown[]) => Promise<unknown>
    return handler(...args)
  })
}
