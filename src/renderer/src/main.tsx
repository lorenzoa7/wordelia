import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function App(): React.JSX.Element {
  return <h1 style={{ fontFamily: 'monospace', padding: 48 }}>wordelia</h1>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
