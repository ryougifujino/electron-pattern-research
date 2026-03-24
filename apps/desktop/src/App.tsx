import { createSignal } from 'solid-js'
import { createDesktopClient } from './desktop-client.ts'
import './App.css'

const desktopClient = createDesktopClient()

function App() {
  const [responseText, setResponseText] = createSignal('')

  const runDesktopDemo = async () => {
    const echoedValue = await desktopClient.demo.echo('233')
    const pingReply = await desktopClient.system.ping()
    setResponseText(`${pingReply} ${echoedValue}`)
  }

  return (
    <main class="app">
      <h1>RPC over IPC</h1>
      <div class="card">
        <button onClick={() => void runDesktopDemo()}>{'renderer -> preload bridge -> main procedures'}</button>
        <p>{responseText()}</p>
      </div>
    </main>
  )
}

export default App
