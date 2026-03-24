import { defineIpcHandlers } from './ipc.ts'

export const createDesktopHandlers = () =>
  defineIpcHandlers({
    async ping() {
      return 'pong from main'
    },
    foo(bar: string) {
      return Promise.resolve(bar)
    },
  })

export type DesktopApi = ReturnType<typeof createDesktopHandlers>
