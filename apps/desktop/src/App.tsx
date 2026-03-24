import { createSignal } from 'solid-js'
import { desktopApi } from './desktop-api.ts'
import './App.css'

function App() {
  const [message, setMessage] = createSignal('')

  const callMain = async () => {
    const foo = await desktopApi.foo('233')
    const result = await desktopApi.ping()
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
