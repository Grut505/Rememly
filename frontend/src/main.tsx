import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const renderApp = () => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}

const showBlockingScreen = (message: string) => {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui, -apple-system, sans-serif;color:#111;">
      <div>${message}</div>
    </div>
  `
}

const getSavedUserEmail = (): string | null => {
  const userJson = localStorage.getItem('user')
  if (!userJson) return null
  try {
    const user = JSON.parse(userJson)
    return typeof user.email === 'string' ? user.email : null
  } catch {
    return null
  }
}

const authCheck = async () => {
  if (window.location.pathname === '/auth') {
    renderApp()
    return
  }

  const email = getSavedUserEmail()
  if (!email) {
    window.location.replace('/auth')
    return
  }

  showBlockingScreen('Checking authentication...')

  const baseUrl = import.meta.env.VITE_APPS_SCRIPT_URL
  const authParam = `&auth=${encodeURIComponent('Email ' + email)}`
  const response = await fetch(`${baseUrl}?path=auth/check${authParam}`, {
    method: 'POST',
  })
  const data = await response.json()

  if (!data?.ok) {
    localStorage.removeItem('user')
    const errorMessage = data?.error?.message || 'Your account is not authorized to access this application.'
    localStorage.setItem('auth_error', errorMessage)
    window.location.replace('/auth')
    return
  }

  localStorage.setItem('user', JSON.stringify(data.data?.user))
  renderApp()
}

authCheck().catch(() => {
  localStorage.removeItem('user')
  localStorage.setItem('auth_error', 'Authentication check failed.')
  window.location.replace('/auth')
})
