import { firebaseConfigured } from './firebase'
import { useAuth } from './context/authContext'
import { Login } from './components/Login'
import { Dashboard } from './components/Dashboard'
import './App.css'

function ConfigNeeded() {
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-badge">🛠️</div>
        <h1>Almost there</h1>
        <p className="muted">
          Add your Firebase web config to a <code>.env</code> file in the project root,
          then restart the dev server. See <code>.env.example</code> and the README for the
          exact variable names.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!firebaseConfigured) return <ConfigNeeded />
  return <AuthedApp />
}

function AuthedApp() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="login">
        <div className="spinner" />
      </div>
    )
  }
  return user ? <Dashboard /> : <Login />
}
