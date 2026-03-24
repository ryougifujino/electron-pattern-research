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

## IPC Namespaces

IPC handlers now support nested namespaces, so you can group APIs by domain
instead of putting everything on a single flat client:

```ts
export const createDesktopHandlers = () =>
  defineIpcHandlers({
    system: {
      ping: async () => 'pong from main',
    },
    user: {
      profile: async () => ({ id: '1' }),
    },
  })
```

The renderer client mirrors that shape automatically:

```ts
const api = createDesktopApiClient()

await api.system.ping()
await api.user.profile()
```

If you want a different root name, create the client with your own variable
name or place it inside your own object tree.
