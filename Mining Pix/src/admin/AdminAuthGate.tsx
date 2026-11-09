import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase/client'
import AdminDashboard from './AdminDashboard'
import './admin.css'

export default function AdminAuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError('Não foi possível recuperar a sessão. Entre novamente.')
      setSession(data.session)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
      setSession(data.session)
      setPassword('')
      if (data.user?.app_metadata?.admin !== true) {
        setError('Esta conta não possui autorização administrativa. O acesso ao painel foi negado.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na autenticação.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setError('')
  }

  if (loading) {
    return <main className="admin-auth-shell"><section className="admin-auth-card"><span className="admin-mark">MP</span><h1>MINING PIX ADMIN</h1><p>Validando sessão...</p></section></main>
  }

  if (session?.user?.app_metadata?.admin === true) {
    return <AdminDashboard userEmail={session.user.email ?? ''} onSignOut={signOut} />
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card">
        <span className="admin-mark">MP</span>
        <span className="admin-eyebrow">CENTRO DE CONTROLE PRIVADO</span>
        <h1>Mining Pix Admin</h1>
        <p>Entre com sua conta autorizada. O acesso é validado no backend, não apenas nesta interface.</p>
        {session && (
          <div className="admin-denied" role="alert">
            <strong>Acesso administrativo negado</strong>
            <span>A sessão atual não possui a permissão <code>app_metadata.admin=true</code>.</span>
            <button type="button" className="admin-secondary" onClick={() => { void signOut() }}>ENCERRAR SESSÃO</button>
          </div>
        )}
        {!session && (
          <form className="admin-login-form" onSubmit={signIn}>
            <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'VALIDANDO...' : 'ENTRAR NO PAINEL'}</button>
          </form>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
        <a className="admin-back-link" href="./">← Voltar ao Mining Pix</a>
        <small className="admin-footnote">Ambiente DEV · Controles restritos · Nenhuma operação financeira pode ser executada aqui.</small>
      </section>
    </main>
  )
}
