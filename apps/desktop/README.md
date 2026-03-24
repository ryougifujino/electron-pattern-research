## Usage

```bash
$ pnpm install
$ pnpm dev
```

`pnpm dev` starts the renderer on a Vite dev server, watches the Electron
bundle, and restarts Electron when Electron-side code changes.

## Available Scripts

From the workspace root, you can run:

### `pnpm dev`

Starts the desktop development workflow.<br>
The renderer uses Vite HMR and Electron restarts automatically after Electron
bundle rebuilds.

### `pnpm --filter @electron-pattern-research/desktop dev:renderer`

Runs only the renderer dev server.

### `pnpm build`

Builds the renderer and Electron bundle for production.

Learn more on the [Solid Website](https://solidjs.com) and the
[Electron Website](https://www.electronjs.org/).

## IPC As RPC

This desktop app treats Electron IPC as a small RPC system.

Electron gives us process-to-process messaging primitives such as
`ipcRenderer.invoke()` and `ipcMain.handle()`. On their own, those primitives
are only a transport. This project adds a pattern on top of them:

- the main process owns a typed `procedure tree`
- the preload layer exposes a minimal `bridge`
- the renderer gets a nested `client proxy`
- one transport `channel` carries logical procedure paths such as `system.ping`

Thinking about the pattern as "RPC over IPC" helps separate transport concerns
from domain concerns. IPC answers "how do messages move between processes?",
while RPC answers "what operation is the caller trying to execute?".

### Why Use This Pattern

Electron apps usually need renderer code to ask the main process to do
privileged work. A few constraints shape the design:

- the renderer cannot call main-process functions directly
- exposing raw `ipcRenderer` to the renderer is broader than we want
- a flat list of IPC channels becomes hard to organize as features grow
- request and response types can drift if every layer defines its own API shape

This pattern keeps the boundary narrow and explicit. The renderer only sees a
small bridge, the main process keeps the real implementation, and namespaced
procedures make the API easier to reason about.

### Architecture

```mermaid
flowchart LR
  R["Renderer: desktopClient.system.ping()"]
  P["Preload: desktopBridge.invoke(path, ...args)"]
  C["IPC Channel: desktop:rpc"]
  M["Main: registerIpcProcedures()"]
  T["Procedure Tree: system.ping"]

  R --> P
  P --> C
  C --> M
  M --> T
```

The same request moves through four layers:

1. The renderer calls a nested client method such as `desktopClient.system.ping()`.
2. The client proxy converts property access into the procedure path `system.ping`.
3. The preload bridge forwards that path and its arguments through the single `desktop:rpc` channel.
4. The main process looks up the procedure by path and executes the matching function.

### Core Concepts

- `IPC`: Electron's inter-process communication mechanism. It is the low-level transport between renderer and main.
- `RPC`: remote procedure call. It lets the caller think in terms of "call this operation" instead of "send this event".
- `channel`: the concrete Electron transport name. In this project it is `desktop:rpc`.
- `procedure tree`: the main-process object tree that groups callable procedures by namespace.
- `namespace`: an object grouping such as `system` or `demo`. It helps organize related procedures.
- `procedure path`: the dot-joined identifier derived from the tree, such as `system.ping` or `demo.echo`.
- `bridge`: the preload object exposed on `window`. It forwards calls without exposing the whole Electron API surface.
- `client proxy`: the renderer-side proxy object that mirrors the procedure tree and lazily builds procedure paths.
- `registry`: the flattened lookup table in main that maps procedure paths to executable functions.

### Code Map

The pattern is distributed across a few small files, each with a single role:

- `desktop-procedures.ts`: defines the main-process procedure tree
- `ipc.ts`: defines the shared pattern, type relationships, proxy creation, and main-side registration
- `preload.ts`: exposes the minimal bridge via `contextBridge`
- `main.ts`: registers the procedure tree on the IPC transport
- `src/desktop-client.ts`: creates the renderer-side client proxy

### Procedure Tree

The main process defines the actual callable surface:

```ts
export const createDesktopProcedures = () =>
  defineIpcProcedureTree({
    system: {
      ping: async () => 'pong from main',
    },
    demo: {
      echo: async (value: string) => value,
    },
  })
```

This tree is the source of truth. If a procedure exists here, the renderer can
call it through the proxy client. If it does not exist here, there is nothing
to dispatch on the main side.

Procedure trees also have a few runtime guardrails so the proxy can round-trip
procedure names safely:

- namespaces must be plain objects
- each path segment must be non-empty
- path segments cannot contain `.`
- path segments cannot be named `then`

### Bridge

The preload layer exposes a deliberately tiny bridge:

```ts
contextBridge.exposeInMainWorld('desktopBridge', createIpcBridge<DesktopProcedures>(ipcRenderer, DESKTOP_RPC_CHANNEL))
```

This is an important boundary. The renderer does not receive raw
`ipcRenderer`; it only receives an `invoke` capability scoped to this pattern.

### Client Proxy

The renderer client mirrors the procedure tree automatically:

```ts
const desktopClient = createDesktopClient()

await desktopClient.system.ping()
await desktopClient.demo.echo('hello')
```

The client is a `Proxy`. Property access builds up a path segment by segment,
and the final function call sends the accumulated path over IPC. That is why
`desktopClient.system.ping()` can be implemented without manually declaring a
renderer-side wrapper for every procedure.

### Dispatch Model

On the main side, the nested procedure tree is flattened into a registry:

- `system.ping` -> `system.ping()`
- `demo.echo` -> `demo.echo(value)`

When the main process receives a request on `desktop:rpc`, it looks up the
procedure path in that registry and executes the matching function.

This gives us a useful split:

- the transport stays simple because there is only one Electron channel
- the API stays organized because the logical shape lives in the procedure tree

### Design Benefits

- Clear boundaries: each layer has one job and one vocabulary.
- Better naming: domains live in namespaces instead of scattered channel names.
- Safer exposure: the renderer sees a small bridge, not the raw Electron API.
- Stronger typing: procedure names, arguments, and return values flow from the main definition into the client.
- Easier growth: adding a new feature usually means adding a new procedure in the tree, not inventing another ad hoc IPC pattern.

If you want a different renderer-side root name, create the client with your
own variable name or place it inside your own object tree. The transport still
goes through the single `desktop:rpc` channel, while the logical API remains
expressed as procedure paths on top of that channel.
