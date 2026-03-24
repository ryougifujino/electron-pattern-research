import type { IpcMain, IpcRenderer } from 'electron'

type AsyncProcedure = (...args: never[]) => Promise<unknown>
type StringKeyOf<T> = Extract<keyof T, string>
type JoinPath<Prefix extends string, Segment extends string> = Prefix extends '' ? Segment : `${Prefix}.${Segment}`

const RESERVED_PROCEDURE_SEGMENTS = new Set(['then'])

export interface IpcProcedureTree {
  [key: string]: AsyncProcedure | IpcProcedureTree
}

type LeafProcedurePaths<T extends IpcProcedureTree, Prefix extends string = ''> = {
  [K in StringKeyOf<T>]: T[K] extends AsyncProcedure
    ? JoinPath<Prefix, K>
    : T[K] extends IpcProcedureTree
      ? LeafProcedurePaths<T[K], JoinPath<Prefix, K>>
      : never
}[StringKeyOf<T>]

type PathValue<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends StringKeyOf<T>
    ? PathValue<T[Head], Tail>
    : never
  : Path extends StringKeyOf<T>
    ? T[Path]
    : never

type ProcedureAtPath<T extends IpcProcedureTree, Path extends LeafProcedurePaths<T>> = Extract<
  PathValue<T, Path>,
  AsyncProcedure
>
type ProcedureArgs<T extends IpcProcedureTree, Path extends LeafProcedurePaths<T>> = Parameters<
  ProcedureAtPath<T, Path>
>
type ProcedureResult<T extends IpcProcedureTree, Path extends LeafProcedurePaths<T>> = Awaited<
  ReturnType<ProcedureAtPath<T, Path>>
>

type IpcInvokeTransport<T extends IpcProcedureTree> = <K extends LeafProcedurePaths<T>>(
  procedurePath: K,
  ...args: ProcedureArgs<T, K>
) => Promise<ProcedureResult<T, K>>

export type IpcBridge<T extends IpcProcedureTree> = {
  invoke: IpcInvokeTransport<T>
}

export type IpcProcedureClient<T extends IpcProcedureTree> = {
  [K in keyof T]: T[K] extends AsyncProcedure ? T[K] : T[K] extends IpcProcedureTree ? IpcProcedureClient<T[K]> : never
}

export const DESKTOP_RPC_CHANNEL = 'desktop:rpc' as const

const formatProcedurePath = (pathSegments: string[]) => (pathSegments.length === 0 ? '<root>' : pathSegments.join('.'))

const isPlainObject = (value: unknown): value is IpcProcedureTree => {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const assertValidProcedureSegment = (segment: string, pathSegments: string[]) => {
  if (segment.length === 0) {
    throw new TypeError(
      `Invalid IPC procedure segment at "${formatProcedurePath(pathSegments)}": segments must be non-empty`,
    )
  }

  if (segment.includes('.')) {
    throw new TypeError(`Invalid IPC procedure segment "${segment}": segments cannot contain "."`)
  }

  if (RESERVED_PROCEDURE_SEGMENTS.has(segment)) {
    throw new TypeError(`Invalid IPC procedure segment "${segment}": segments cannot use reserved segment "${segment}"`)
  }
}

const validateIpcProcedureTree = (procedures: IpcProcedureTree, pathSegments: string[] = []) => {
  if (!isPlainObject(procedures)) {
    throw new TypeError(
      `Invalid IPC procedure tree at "${formatProcedurePath(pathSegments)}": namespaces must be plain objects`,
    )
  }

  for (const [key, value] of Object.entries(procedures)) {
    const nextPathSegments = [...pathSegments, key]

    assertValidProcedureSegment(key, nextPathSegments)

    if (typeof value === 'function') {
      continue
    }

    if (isPlainObject(value)) {
      validateIpcProcedureTree(value, nextPathSegments)
      continue
    }

    throw new TypeError(
      `Invalid IPC procedure tree at "${formatProcedurePath(nextPathSegments)}": namespaces must be plain objects`,
    )
  }
}

export const defineIpcProcedureTree = <T extends IpcProcedureTree>(procedures: T): T => {
  validateIpcProcedureTree(procedures)
  return procedures
}

export const createIpcBridge = <T extends IpcProcedureTree>(
  ipcRenderer: Pick<IpcRenderer, 'invoke'>,
  channel: string,
): IpcBridge<T> => ({
  invoke: (procedurePath, ...args) => ipcRenderer.invoke(channel, procedurePath, ...(args as unknown[])),
})

const createIpcProcedureProxy = (
  invokeProcedure: (procedurePath: string, ...args: unknown[]) => Promise<unknown>,
  pathSegments: string[],
) =>
  new Proxy(() => undefined, {
    apply(_target, _thisArg, args) {
      if (pathSegments.length === 0) {
        throw new Error('Cannot invoke the root IPC namespace directly')
      }

      return invokeProcedure(pathSegments.join('.'), ...args)
    },
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then') {
        return undefined
      }

      return createIpcProcedureProxy(invokeProcedure, [...pathSegments, property])
    },
  })

export const createIpcProcedureClient = <T extends IpcProcedureTree>(
  invokeProcedure: IpcInvokeTransport<T>,
): IpcProcedureClient<T> => {
  // The proxy is intentionally both callable and traversable, so nested namespaces
  // like `api.system.ping()` resolve without needing the full handler tree in preload.
  return createIpcProcedureProxy(
    invokeProcedure as (procedurePath: string, ...args: unknown[]) => Promise<unknown>,
    [],
  ) as unknown as IpcProcedureClient<T>
}

const flattenIpcProcedureTree = (
  procedures: IpcProcedureTree,
  pathSegments: string[] = [],
  registry = new Map<string, (...args: unknown[]) => Promise<unknown>>(),
) => {
  for (const [key, value] of Object.entries(procedures)) {
    const nextPathSegments = [...pathSegments, key]

    if (typeof value === 'function') {
      registry.set(nextPathSegments.join('.'), value as (...args: unknown[]) => Promise<unknown>)
      continue
    }

    if (isPlainObject(value)) {
      flattenIpcProcedureTree(value, nextPathSegments, registry)
      continue
    }

    throw new TypeError(
      `Invalid IPC procedure tree at "${formatProcedurePath(nextPathSegments)}": namespaces must be plain objects`,
    )
  }

  return registry
}

export const registerIpcProcedures = <T extends IpcProcedureTree>(
  ipcMain: Pick<IpcMain, 'handle'>,
  channel: string,
  procedures: T,
) => {
  validateIpcProcedureTree(procedures)
  const registry = flattenIpcProcedureTree(procedures)

  ipcMain.handle(channel, (_event, procedurePath: string, ...args: unknown[]) => {
    const procedure = registry.get(procedurePath)

    if (procedure === undefined) {
      throw new Error(`Unknown IPC procedure: ${procedurePath}`)
    }

    return procedure(...args)
  })
}
