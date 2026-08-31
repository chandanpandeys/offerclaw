import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AgentProvider } from './AgentContext.jsx'
import Insights from './Insights.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AgentProvider>
      <App />
      <Insights />
    </AgentProvider>
  </React.StrictMode>,
)
