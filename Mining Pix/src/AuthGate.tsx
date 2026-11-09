import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase/client'
import App from './App'
import './App.css'

type AuthMode = 'signin' | 'signup' | 'reset' | 'update'

function getRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileName, setProfileName] = useState('Minerador')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setErrorMessage('Não foi possível recuperar sua sessão. Entre novamente.')
      setSession(data.session)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    async function loadAccountProfile() {
      if (!session?.user) return
      const user = session.user
      const metadataName = typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : ''
      const fallbackName = metadataName || user.email?.split('@')[0] || 'Minerador'

      const [profileResult, walletResult, progressResult] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('player_progress').select('xp, level').eq('user_id', user.id).maybeSingle(),
      ])

      if (!active) return
      if (profileResult.error || walletResult.error || progressResult.error) {
        setErrorMessage('Sua sessão foi autenticada, mas não foi possível consultar todos os registros da conta. Tente atualizar a página; nenhuma recompensa foi sincronizada.')
        return
      }

      if (!profileResult.data || !walletResult.data || !progressResult.data) {
        setErrorMessage('A conta foi autenticada, mas a estrutura inicial do jogador está incompleta. Entre em contato com a administração do projeto.')
        return
      }

      setProfileName(profileResult.data.display_name || fallbackName)
    }

    void loadAccountProfile()
    return () => { active = false }
  }, [session?.user?.id])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setErrorMessage('')

    try {
      if (mode === 'signup') {
        const name = displayName.trim()
        if (!name || name.length > 32) throw new Error('O nome deve ter entre 1 e 32 caracteres.')
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.')

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getRedirectUrl(),
            data: { display_name: name },
          },
        })
        if (error) throw error

        if (data.session && data.user) {
          await supabase.from('profiles').update({ display_name: name }).eq('user_id', data.user.id)
          setNotice('Conta criada! Seu perfil, carteira e progressão inicial foram provisionados.')
        } else {
          setNotice('Cadastro iniciado! Verifique seu e-mail e confirme o endereço antes de entrar.')
          setMode('signin')
        }
        setPassword('')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        setPassword('')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getRedirectUrl(),
        })
        if (error) throw error
        setNotice('Se o endereço estiver cadastrado, você receberá um e-mail com as instruções de recuperação.')
      } else {
        if (password.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword('')
        setMode('signin')
        setNotice('Senha atualizada. Você já pode continuar usando sua conta.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setErrorMessage('Não foi possível encerrar a sessão. Tente novamente.')
  }

  if (loading) {
    return <div className="auth-shell"><div className="auth-card"><span className="auth-mark">⛏</span><h1>MINING PIX</h1><p>Verificando sessão segura...</p></div></div>
  }

  if (session?.user && !errorMessage) {
    return <App
      userId={session.user.id}
      email={session.user.email ?? ''}
      displayName={profileName}
      onSignOut={handleSignOut}
    />
  }

  const title = mode === 'signup' ? 'Criar sua conta' : mode === 'reset' ? 'Recuperar acesso' : mode === 'update' ? 'Definir nova senha' : 'Bem-vindo de volta'
  const description = mode === 'signup'
    ? 'Crie sua identidade individual no Mining Pix.'
    : mode === 'reset'
      ? 'Enviaremos instruções para o seu e-mail.'
      : mode === 'update'
        ? 'Escolha uma nova senha para sua conta.'
        : 'Entre para acessar seu ambiente de mineração.'

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-mark">⛏</span><div><strong>MINING PIX</strong><small>DIGITAL MINING</small></div></div>
        <span className="eyebrow">IDENTIDADE DO JOGADOR</span>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>

        {mode !== 'reset' && mode !== 'update' && (
          <div className="auth-tabs">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setErrorMessage(''); setNotice('') }}>Entrar</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setErrorMessage(''); setNotice('') }}>Criar conta</button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && <label>Nome de jogador<input autoComplete="nickname" maxLength={32} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Como deseja ser chamado?" required /></label>}
          {mode !== 'update' && <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" required /></label>}
          {mode !== 'reset' && <label>{mode === 'update' ? 'Nova senha' : 'Senha'}<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" minLength={8} required /></label>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'AGUARDE...' : mode === 'signup' ? 'CRIAR CONTA' : mode === 'reset' ? 'ENVIAR INSTRUÇÕES' : mode === 'update' ? 'ATUALIZAR SENHA' : 'ENTRAR NO MINING PIX'}</button>
        </form>

        {mode === 'signin' && <button className="auth-link" type="button" onClick={() => { setMode('reset'); setNotice(''); setErrorMessage('') }}>Esqueci minha senha</button>}
        {(mode === 'reset' || mode === 'update') && <button className="auth-link" type="button" onClick={() => { setMode('signin'); setNotice(''); setErrorMessage('') }}>Voltar para entrar</button>}

        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        <p className="auth-footnote">Conta individual · Ambiente DEV · Economia ainda em sandbox local</p>
      </section>
    </main>
  )
}
