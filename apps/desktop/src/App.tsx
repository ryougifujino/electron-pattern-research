import { createSignal } from 'solid-js'
import { createDesktopApiClient } from './desktop-api.ts'
import './App.css'

const api = createDesktopApiClient()

function App() {
  const [message, setMessage] = createSignal('')

  const callMain = async () => {
    const foo = await api.demo.foo('233')
    const result = await api.system.ping()
    setMessage(result + foo)
  }

  return (
    <main class="app">
      <h1>Minimal IPC</h1>
      <div class="card">
        <button onClick={() => void callMain()}>{'renderer -> preload -> main'}</button>
        <p>{message()}</p>
      </div>
    </main>
  )
}

export default App
