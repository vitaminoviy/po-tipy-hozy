import React, { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="fallback">
        <h1>Не удалось открыть 3D-сцену</h1>
        <p>Проверьте поддержку WebGL и аппаратное ускорение браузера.</p>
        <button onClick={() => location.reload()}>Повторить</button>
      </div>
    ) : (
      this.props.children
    )
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
