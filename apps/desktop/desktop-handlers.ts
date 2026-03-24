import { defineIpcHandlers } from './ipc.ts'

export const createDesktopHandlers = () =>
  defineIpcHandlers({
    system: {
      async ping() {
        return 'pong from main'
      },
    },
    demo: {
      foo(bar: string) {
        return Promise.resolve(bar)
      },
    },
  })

export type DesktopApi = ReturnType<typeof createDesktopHandlers>
