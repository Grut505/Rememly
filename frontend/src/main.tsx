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

const getSavedUser = (): { email: string; session_token?: string } | null => {
  const userJson = localStorage.getItem('user')
  if (!userJson) return null
  try {
    const user = JSON.parse(userJson)
    if (typeof user.email !== 'string') return null
    return { email: user.email, session_token: typeof user.session_token === 'string' ? user.session_token : undefined }
  } catch {
    return null
  }
}

const authCheck = async () => {
  if (window.location.pathname === '/auth') {
    renderApp()
    return
  }

  const savedUser = getSavedUser()
  if (!savedUser) {
    window.location.replace('/auth')
    return
  }

  showBlockingScreen('Checking authentication...')

  const baseUrl = import.meta.env.VITE_APPS_SCRIPT_URL
  const credential = savedUser.session_token ? `Session ${savedUser.session_token}` : `Email ${savedUser.email}`
  const authParam = `&auth=${encodeURIComponent(credential)}`
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

  localStorage.setItem(
    'user',
    JSON.stringify({
      ...data.data?.user,
      session_token: data.data?.session_token || savedUser.session_token,
    })
  )
  renderApp()
}

authCheck().catch(() => {
  localStorage.removeItem('user')
  localStorage.setItem('auth_error', 'Authentication check failed.')
  window.location.replace('/auth')
})
