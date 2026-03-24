import { defineIpcProcedureTree } from './ipc.ts'

export const createDesktopProcedures = () =>
  defineIpcProcedureTree({
    system: {
      async ping() {
        return 'pong from main'
      },
    },
    demo: {
      echo(value: string) {
        return Promise.resolve(value)
      },
    },
  })

export type DesktopProcedures = ReturnType<typeof createDesktopProcedures>
