import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase/client'

type PoolAllocation = {
  cycle_key: string
  amount_pc: number | string
  amount_mc: number | string
  hashrate_snapshot: number | string
  share: number | string
  created_at: string
}
type PoolCycle = {
  id: string
  cycle_key: string
  status: 'open'
  budget_mc: number | string
  opened_at: string
  total_hashrate: number | string
  participant_count: number
}
type PoolDashboard = {
  player_hashrate: number | string
  network_hashrate: number | string
  participation: number | string
  current_cycle: PoolCycle | null
  history: PoolAllocation[]
}
const number = (value: number | string) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export default function PersistentMiningPool({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<PoolDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [miningCoinBalance, setMiningCoinBalance] = useState<number | string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [dashboardResult, walletResult] = await Promise.all([
      supabase.rpc('get_pool_dashboard'),
      supabase.from('mining_coin_wallets').select('balance').maybeSingle(),
    ])
    if (dashboardResult.error) setError(dashboardResult.error.message)
    else setData(dashboardResult.data as PoolDashboard)
    if (walletResult.error) setError((previous) => previous || walletResult.error.message)
    else setMiningCoinBalance(walletResult.data?.balance ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const cycle = data?.current_cycle ?? null
  const history = data?.history ?? []
  const blockRemaining = cycle ? Math.max(0, Math.ceil((new Date(cycle.opened_at).getTime() + 600000 - now) / 1000)) : 0
  const timerLabel = `${String(Math.floor(blockRemaining / 60)).padStart(2, '0')}:${String(blockRemaining % 60).padStart(2, '0')}`

  if (compact) return (
    <section className="pool-timer-compact">
      <div className="pool-timer-meta"><span className="eyebrow">PIX BLOCK · 600 SEGUNDOS</span><span className={cycle ? 'pool-live-indicator' : 'pool-idle-indicator'}>{cycle ? 'MINERANDO' : 'AGUARDANDO'}</span></div>
      <div className="pool-timer-main">
        <div><span>PRÓXIMO FECHAMENTO</span><strong className="pool-digital-timer">{loading ? '--:--' : cycle ? timerLabel : '--:--'}</strong></div>
        <span className="pool-timer-caption">{loading ? 'SINCRONIZANDO COM A POOL' : cycle ? (blockRemaining > 0 ? 'CONTAGEM REGRESSIVA DO BLOCO' : 'TEMPO CONCLUÍDO · AGUARDANDO LIQUIDAÇÃO') : 'NENHUM BLOCO ABERTO'}</span>
      </div>
      {error && <small className="persistent-store-error">{error}</small>}
    </section>
  )

  return (
    <section className="persistent-pool panel page-panel">
      <div className="persistent-facility-heading">
        <div>
          <span className="eyebrow">ECONOMIA SERVER-SIDE · POSTGRESQL</span>
          <h2>Mining Pool persistente</h2>
          <p>Participação calculada com equipamentos instalados e registrados na sua conta.</p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>ATUALIZAR</button>
      </div>

      {error && <div className="persistent-store-error" role="alert">{error}</div>}

      <div className="stats">
        <article className="stat-card">
          <span>SEU HASHRATE ELEGÍVEL</span>
          <h2>{loading || !data ? '—' : <>{number(data.player_hashrate)} <small>H/s</small></>}</h2>
        </article>
        <article className="stat-card">
          <span>HASHRATE GLOBAL ELEGÍVEL</span>
          <h2>{loading || !data ? '—' : <>{number(data.network_hashrate)} <small>H/s</small></>}</h2>
        </article>
        <article className="stat-card">
          <span>SUA PARTICIPAÇÃO ATUAL</span>
          <h2>{loading || !data ? '—' : <>{(Number(data.participation) * 100).toFixed(4)} <small>%</small></>}</h2>
        </article>
      </div>

      <div className="pool-footer">
        <span>Status do PIX BLOCK</span>
        <strong>{loading ? 'CONSULTANDO...' : cycle ? 'BLOCO EM MINERAÇÃO' : 'AGUARDANDO PRÓXIMO BLOCO'}</strong>
      </div>
      {cycle && <div className="pool-footer"><span>Tempo de bloco · 600 segundos</span><strong>{blockRemaining > 0 ? `${Math.floor(blockRemaining / 60)}m ${blockRemaining % 60}s restantes` : 'TEMPO CONCLUÍDO · AGUARDANDO LIQUIDAÇÃO'}</strong></div>}
      <div className="pool-footer"><span>Seu saldo de MINING COIN</span><strong>{loading || miningCoinBalance === null ? 'CONSULTANDO...' : `${number(miningCoinBalance)} MC`}</strong></div>
      {cycle && (
        <>
          <div className="pool-footer"><span>Orçamento de MINING COIN do ciclo</span><strong>{number(cycle.budget_mc)} MC</strong></div>
          <div className="pool-footer"><span>Identificador do bloco</span><strong>{cycle.cycle_key}</strong></div>
        </>
      )}

      <div className="panel-heading"><h3>Suas últimas distribuições</h3><span className="equipment-count">{history.length} registros</span></div>
      {loading ? <p className="page-description">Consultando a Mining Pool...</p> : history.length === 0
        ? <p className="page-description">Nenhuma distribuição persistente registrada. Recompensas locais do simulador não aparecem neste histórico.</p>
        : history.map((item) => {
          const isLegacyPc = Number(item.amount_pc) > 0 && Number(item.amount_mc) === 0
          const amount = isLegacyPc ? item.amount_pc : item.amount_mc
          const currency = isLegacyPc ? 'PC' : 'MC'
          return (
            <div className="history-item" key={item.cycle_key}>
              <div><strong>{item.cycle_key}</strong><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small></div>
              <strong>+{number(amount)} {currency}</strong>
            </div>
          )
        })}

      <p className="persistent-store-footnote">
        Apenas equipamentos persistentes participam. Bots locais, orçamento do sandbox e hashrate temporário de jogos são ignorados.
        Novos ciclos distribuem exclusivamente MINING COIN (MC); registros antigos em PIX COIN (PC) permanecem identificados como históricos.
        A liquidação ocorre atomicamente no backend. MC ainda não pode ser comprada, convertida ou sacada.
      </p>
    </section>
  )
}
