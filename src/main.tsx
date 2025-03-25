import './polyfills';
import React from 'react'
import { render } from 'react-dom'
import App from './App'
import './index.scss'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  root
)
