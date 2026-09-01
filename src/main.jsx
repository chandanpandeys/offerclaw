import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AgentProvider } from './AgentContext.jsx'
import CommandCenter from './CommandCenter.jsx'
import Insights from './Insights.jsx'
import ScoutCenter from './ScoutCenter.jsx'
import SupervisedPrefillCenter from './SupervisedPrefillCenter.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AgentProvider>
      <App />
      <CommandCenter />
      <ScoutCenter />
      <SupervisedPrefillCenter />
      <Insights />
    </AgentProvider>
  </React.StrictMode>,
)
