import { createSignal } from 'solid-js'
import './App.css'

function App() {
  const [message, setMessage] = createSignal('点击按钮调用 main')

  const callMain = async () => {
    const result = await window.electronAPI.ping()
    setMessage(result)
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
