import React from 'react'
import ReactDOM from 'react-dom/client'
import DriverApp from './DriverApp'
import { registerSW } from '../push'
import { startPresence } from '../presence'
import '../index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DriverApp />
  </React.StrictMode>
)

if (import.meta.env.PROD) window.addEventListener('load', () => registerSW().catch(() => {}))
if (import.meta.env.PROD) startPresence('driver')
