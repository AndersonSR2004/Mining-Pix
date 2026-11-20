import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase/client'

type Factor = { id: string; friendly_name?: string }

export default function SandboxMfaGate({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [factors, setFactors] = useState<Factor[]>([])
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const inspectSession = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error) throw assurance.error
      if (assurance.data.currentLevel === 'aal2') {
        setVerified(true)
        return
      }
      setVerified(false)
      const result = await supabase.auth.mfa.listFactors()
      if (result.error) throw result.error
      setFactors(result.data.totp)
      setFactorId(result.data.totp[0]?.id ?? '')
    } catch {
      setError('Não foi possível validar a autenticação em dois fatores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void inspectSession() }, [inspectSession])

  async function enroll() {
    setBusy(true)
    setError('')
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (enrollError) throw enrollError
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
    } catch {
      setError('Não foi possível cadastrar o autenticador.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!factorId || !/^\d{6}$/.test(code)) return
    setBusy(true)
    setError('')
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (verifyError) throw verifyError
      setQrCode('')
      setCode('')
      await inspectSession()
    } catch {
      setError('Código recusado. Digite o próximo código gerado pelo aplicativo.')
    } finally {
      setBusy(false)
    }
  }

  if (verified) return children

  return (
    <section className="admin-panel">
      <h2>Autenticação em dois fatores</h2>
      <p>Valide sua sessão para acessar a carteira administrativa e os controles da pool.</p>
      {loading && <p role="status">Verificando sessão...</p>}
      {!loading && !factorId && (
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => void enroll()}>
          Cadastrar aplicativo autenticador
        </button>
      )}
      {!loading && factorId && (
        <form className="admin-login-form admin-depix-mfa" onSubmit={verify}>
          {qrCode && <img className="admin-depix-qr" src={qrCode} alt="Código QR para cadastrar no aplicativo autenticador" />}
          {factors.length > 1 && (
            <label>Aplicativo autenticador
              <select value={factorId} onChange={(event) => setFactorId(event.target.value)} disabled={busy}>
                {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Autenticador ${index + 1}`}</option>)}
              </select>
            </label>
          )}
          <label>Código do autenticador
            <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} required />
          </label>
          <button className="admin-primary" type="submit" disabled={busy}>Validar código</button>
        </form>
      )}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </section>
  )
}
