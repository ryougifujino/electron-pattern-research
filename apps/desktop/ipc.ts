import type { IpcMain, IpcRenderer } from 'electron'

type AsyncMethod = (...args: never[]) => Promise<unknown>
type StringKeyOf<T> = Extract<keyof T, string>
type JoinPath<Prefix extends string, Segment extends string> = Prefix extends '' ? Segment : `${Prefix}.${Segment}`

export interface IpcHandlerTree {
  [key: string]: AsyncMethod | IpcHandlerTree
}

export type IpcHandlers<T extends IpcHandlerTree> = {
  [K in keyof T]: T[K] extends AsyncMethod ? T[K] : T[K] extends IpcHandlerTree ? IpcHandlers<T[K]> : never
}

type LeafMethodPaths<T extends IpcHandlerTree, Prefix extends string = ''> = {
  [K in StringKeyOf<T>]: T[K] extends AsyncMethod
    ? JoinPath<Prefix, K>
    : T[K] extends IpcHandlerTree
      ? LeafMethodPaths<T[K], JoinPath<Prefix, K>>
      : never
}[StringKeyOf<T>]

type PathValue<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends StringKeyOf<T>
    ? PathValue<T[Head], Tail>
    : never
  : Path extends StringKeyOf<T>
    ? T[Path]
    : never

type MethodAtPath<T extends IpcHandlerTree, Path extends LeafMethodPaths<T>> = Extract<PathValue<T, Path>, AsyncMethod>
type MethodArgs<T extends IpcHandlerTree, Path extends LeafMethodPaths<T>> = Parameters<MethodAtPath<T, Path>>
type MethodResult<T extends IpcHandlerTree, Path extends LeafMethodPaths<T>> = Awaited<
  ReturnType<MethodAtPath<T, Path>>
>

type InvokeBridge<T extends IpcHandlerTree> = <K extends LeafMethodPaths<T>>(
  method: K,
  ...args: MethodArgs<T, K>
) => Promise<MethodResult<T, K>>

export type ElectronAPI<T extends IpcHandlerTree> = {
  invoke: InvokeBridge<T>
}

export type IpcClient<T extends IpcHandlerTree> = {
  [K in keyof T]: T[K] extends AsyncMethod ? T[K] : T[K] extends IpcHandlerTree ? IpcClient<T[K]> : never
}

export const DESKTOP_IPC_CHANNEL = 'app:invoke' as const

export const defineIpcHandlers = <T extends IpcHandlerTree>(handlers: T): T => handlers

export const createElectronAPI = <T extends IpcHandlerTree>(
  ipcRenderer: Pick<IpcRenderer, 'invoke'>,
  channel: string,
): ElectronAPI<T> => ({
  invoke: (method, ...args) => ipcRenderer.invoke(channel, method, ...(args as unknown[])),
})

const createIpcClientProxy = (invoke: (method: string, ...args: unknown[]) => Promise<unknown>, path: string[]) =>
  new Proxy(() => undefined, {
    apply(_target, _thisArg, args) {
      if (path.length === 0) {
        throw new Error('Cannot invoke the root IPC client directly')
      }

      return invoke(path.join('.'), ...args)
    },
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then') {
        return undefined
      }

      return createIpcClientProxy(invoke, [...path, property])
    },
  })

export const createIpcClient = <T extends IpcHandlerTree>(invoke: InvokeBridge<T>): IpcClient<T> => {
  // The proxy is intentionally both callable and traversable, so nested namespaces
  // like `api.system.ping()` resolve without needing the full handler tree in preload.
  return createIpcClientProxy(
    invoke as (method: string, ...args: unknown[]) => Promise<unknown>,
    [],
  ) as unknown as IpcClient<T>
}

const flattenIpcHandlers = (
  handlers: IpcHandlerTree,
  path: string[] = [],
  registry = new Map<string, (...args: unknown[]) => Promise<unknown>>(),
) => {
  for (const [key, value] of Object.entries(handlers)) {
    const nextPath = [...path, key]

    if (typeof value === 'function') {
      registry.set(nextPath.join('.'), value as (...args: unknown[]) => Promise<unknown>)
      continue
    }

    if (value !== null && typeof value === 'object') {
      flattenIpcHandlers(value, nextPath, registry)
      continue
    }

    throw new TypeError(`Invalid IPC handler at namespace "${nextPath.join('.')}"`)
  }

  return registry
}

export const registerIpcHandlers = <T extends IpcHandlerTree>(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  handlers: T,
) => {
  const registry = flattenIpcHandlers(handlers)

  ipcMain.handle(channel, (_event, method: string, ...args: unknown[]) => {
    const handler = registry.get(method)

    if (handler === undefined) {
      throw new Error(`Unknown IPC method: ${method}`)
    }

    return handler(...args)
  })
}
