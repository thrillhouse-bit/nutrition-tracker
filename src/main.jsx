import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import GameGate from '../control-tower-shift/src/GameGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GameGate app={<App />} />
  </React.StrictMode>,
)
