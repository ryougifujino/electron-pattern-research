import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IpcMainInvokeEvent } from 'electron'
import {
  createIpcBridge,
  createIpcProcedureClient,
  defineIpcProcedureTree,
  registerIpcProcedures,
  type IpcBridge,
  type IpcProcedureTree,
} from './ipc.ts'

type RegisteredIpcHandler = (
  event: IpcMainInvokeEvent,
  procedurePath: string,
  ...args: unknown[]
) => Promise<unknown> | unknown

const mockIpcEvent = {} as IpcMainInvokeEvent

const createMockIpcMain = () => {
  const handlers = new Map<string, RegisteredIpcHandler>()
  const removedChannels: string[] = []

  return {
    handle(channel: string, handler: RegisteredIpcHandler) {
      handlers.set(channel, handler)
    },
    removeHandler(channel: string) {
      removedChannels.push(channel)
      handlers.delete(channel)
    },
    getHandler(channel: string) {
      return handlers.get(channel)
    },
    getRemovedChannels() {
      return removedChannels
    },
  }
}

const getRequiredHandler = (ipcMain: ReturnType<typeof createMockIpcMain>, channel: string) => {
  const handler = ipcMain.getHandler(channel)

  if (handler === undefined) {
    throw new Error(`Expected IPC handler for channel "${channel}" to be registered`)
  }

  return handler
}

const invokeHandler = (handler: RegisteredIpcHandler, procedurePath: string, ...args: unknown[]) =>
  Promise.resolve(handler(mockIpcEvent, procedurePath, ...args))

describe('createIpcBridge', () => {
  it('forwards calls through the configured Electron channel', async () => {
    const recordedCalls: Array<{ channel: string; args: unknown[] }> = []
    const bridge = createIpcBridge<{ demo: { echo: (value: string) => Promise<string> } }>(
      {
        invoke(channel, ...args) {
          recordedCalls.push({ channel, args })
          return Promise.resolve(args.at(-1))
        },
      },
      'desktop:rpc',
    )

    const result = await bridge.invoke('demo.echo', 'hello')

    assert.equal(result, 'hello')
    assert.deepEqual(recordedCalls, [{ channel: 'desktop:rpc', args: ['demo.echo', 'hello'] }])
  })
})

describe('createIpcProcedureClient', () => {
  it('builds nested procedure paths lazily', async () => {
    type ClientProcedures = {
      system: {
        ping: () => Promise<'system.ping'>
      }
      demo: {
        echo: (value: string) => Promise<'demo.echo'>
      }
    }

    const recordedCalls: Array<{ procedurePath: string; args: unknown[] }> = []
    const invokeProcedure = ((procedurePath: string, ...args: unknown[]) => {
      recordedCalls.push({ procedurePath, args })
      return Promise.resolve(procedurePath === 'system.ping' ? 'system.ping' : 'demo.echo')
    }) as IpcBridge<ClientProcedures>['invoke']

    const client = createIpcProcedureClient<ClientProcedures>(invokeProcedure)

    const pingResult = await client.system.ping()
    const echoResult = await client.demo.echo('hello')

    assert.equal(pingResult, 'system.ping')
    assert.equal(echoResult, 'demo.echo')
    assert.deepEqual(recordedCalls, [
      { procedurePath: 'system.ping', args: [] },
      { procedurePath: 'demo.echo', args: ['hello'] },
    ])
  })

  it('rejects invoking the root namespace directly', async () => {
    type ClientProcedures = {
      system: {
        ping: () => Promise<'ok'>
      }
    }
    const invokeProcedure = (() => Promise.resolve('ok')) as IpcBridge<ClientProcedures>['invoke']
    const client = createIpcProcedureClient<ClientProcedures>(invokeProcedure)

    assert.throws(
      () => (client as unknown as (...args: never[]) => Promise<unknown>)(),
      /Cannot invoke the root IPC namespace directly/,
    )
  })
})

describe('defineIpcProcedureTree', () => {
  it('rejects segments that cannot round-trip through the client proxy', () => {
    assert.throws(
      () =>
        defineIpcProcedureTree({
          then: async () => 'unreachable',
        } as IpcProcedureTree),
      /cannot use reserved segment "then"/,
    )
  })

  it('rejects segments that would create ambiguous dotted paths', () => {
    assert.throws(
      () =>
        defineIpcProcedureTree({
          'demo.echo': async () => 'ambiguous',
        } as IpcProcedureTree),
      /cannot contain "\."/,
    )
  })

  it('rejects non-plain namespace objects', () => {
    assert.throws(
      () =>
        defineIpcProcedureTree({
          system: [] as unknown as IpcProcedureTree,
        } as IpcProcedureTree),
      /must be plain objects/,
    )
  })
})

describe('registerIpcProcedures', () => {
  it('dispatches the requested procedure on the shared channel', async () => {
    const ipcMain = createMockIpcMain()

    registerIpcProcedures(
      ipcMain,
      'desktop:rpc',
      defineIpcProcedureTree({
        system: {
          ping: async () => 'pong',
        },
      }),
    )

    const handler = getRequiredHandler(ipcMain, 'desktop:rpc')
    await assert.doesNotReject(async () => {
      const result = await invokeHandler(handler, 'system.ping')
      assert.equal(result, 'pong')
    })
  })

  it('replaces prior handlers and returns generation-safe cleanup', async () => {
    const ipcMain = createMockIpcMain()

    const cleanupFirstRegistration = registerIpcProcedures(
      ipcMain,
      'desktop:rpc',
      defineIpcProcedureTree({
        system: {
          ping: async () => 'first',
        },
      }),
    )

    const cleanupSecondRegistration = registerIpcProcedures(
      ipcMain,
      'desktop:rpc',
      defineIpcProcedureTree({
        system: {
          ping: async () => 'second',
        },
      }),
    )

    const handlerAfterSecondRegistration = getRequiredHandler(ipcMain, 'desktop:rpc')

    assert.equal(await invokeHandler(handlerAfterSecondRegistration, 'system.ping'), 'second')
    assert.deepEqual(ipcMain.getRemovedChannels(), ['desktop:rpc'])

    cleanupFirstRegistration()

    const handlerAfterStaleCleanup = getRequiredHandler(ipcMain, 'desktop:rpc')

    assert.equal(await invokeHandler(handlerAfterStaleCleanup, 'system.ping'), 'second')

    cleanupSecondRegistration()

    assert.equal(ipcMain.getHandler('desktop:rpc'), undefined)
    assert.deepEqual(ipcMain.getRemovedChannels(), ['desktop:rpc', 'desktop:rpc'])
  })

  it('rejects malformed procedure paths before lookup', async () => {
    const ipcMain = createMockIpcMain()

    registerIpcProcedures(
      ipcMain,
      'desktop:rpc',
      defineIpcProcedureTree({
        system: {
          ping: async () => 'pong',
        },
      }),
    )

    const handler = getRequiredHandler(ipcMain, 'desktop:rpc')

    await assert.rejects(() => invokeHandler(handler, ''), /IPC procedure path must be a non-empty string/)
  })

  it('wraps procedure failures with the failing path', async () => {
    const ipcMain = createMockIpcMain()

    registerIpcProcedures(
      ipcMain,
      'desktop:rpc',
      defineIpcProcedureTree({
        system: {
          fail: async () => {
            throw new Error('boom')
          },
        },
      }),
    )

    const handler = getRequiredHandler(ipcMain, 'desktop:rpc')
    await assert.rejects(
      () => invokeHandler(handler, 'system.fail'),
      (error: unknown) => {
        assert(error instanceof Error)
        assert.equal(error.message, 'IPC procedure "system.fail" failed: boom')
        assert(error.cause instanceof Error)
        assert.equal(error.cause.message, 'boom')
        return true
      },
    )
  })
})
