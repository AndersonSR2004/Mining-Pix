import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type Progress = { xp: number; level: number }
type ClaimResult = { awarded: boolean; amount: number; xp: number; level: number; period: string }

export default function PersistentProgressPanel({ userId }: { userId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProgress = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('player_progress')
      .select('xp, level')
      .eq('user_id', userId)
      .single()
    if (queryError) {
      setError('Não foi possível carregar a progressão persistente.')
      setProgress(null)
    } else {
      setProgress({ xp: Number(data.xp), level: Number(data.level) })
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { void loadProgress() }, [loadProgress])

  async function claimDailyLogin() {
    setClaiming(true)
    setError('')
    setMessage('')
    const { data, error: rpcError } = await supabase.rpc('claim_daily_login_xp')
    if (rpcError) {
      setError('Não foi possível processar a recompensa diária. Tente novamente.')
    } else {
      const result = data as ClaimResult
      setProgress({ xp: Number(result.xp), level: Number(result.level) })
      setMessage(result.awarded
        ? 'Recompensa diária confirmada: +100 XP persistentes.'
        : 'A recompensa diária de hoje já foi resgatada.')
    }
    setClaiming(false)
  }

  const nextLevelProgress = progress ? progress.xp % 1000 : 0

  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">CONTA ONLINE · FASE 8A</span><h2>Progressão persistente</h2></div>
        <span className="status">BACKEND AUTORITATIVO</span>
      </div>
      <p className="page-description">Este progresso fica vinculado à sua conta e é calculado no Supabase. Ele é separado do XP demonstrativo salvo neste navegador.</p>
      {loading && <p className="page-description">Carregando progressão da conta...</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {progress && !loading && (
        <>
          <div className="stats">
            <article className="stat-card"><span>NÍVEL ONLINE</span><h2>{progress.level}</h2></article>
            <article className="stat-card"><span>XP ONLINE</span><h2>{progress.xp.toLocaleString('pt-BR')}</h2></article>
            <article className="stat-card"><span>PRÓXIMO NÍVEL</span><h2>{nextLevelProgress.toLocaleString('pt-BR')} / 1.000</h2></article>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${nextLevelProgress / 10}%` }} /></div>
          <button className="primary-button" onClick={() => void claimDailyLogin()} disabled={claiming}>
            {claiming ? 'PROCESSANDO...' : 'RESGATAR RECOMPENSA DIÁRIA · +100 XP'}
          </button>
        </>
      )}
      {message && <p className="page-description" role="status">{message}</p>}
    </section>
  )
}
